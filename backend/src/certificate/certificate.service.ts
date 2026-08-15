import { Inject, Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import PDFDocument from "pdfkit";
import dayjs from "dayjs";
import type { PluginFunc } from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/pt-br";
import { IUploadRepository } from "../storage/upload-repository.interface";
import { CERTIFICATE_ASSETS_DIRECTORY, DATA_DIRECTORY } from "../constants";
import { PrismaService } from "../prisma/prisma.service";

dayjs.extend(utc as PluginFunc);
dayjs.extend(timezone as PluginFunc);

// Os certificados exibem horário de Brasília (UTC-3) independentemente do
// fuso do servidor (ex.: o container roda em UTC).
const BRASILIA_TIMEZONE = "America/Sao_Paulo";

export interface CertificateFileInfo {
  fileName: string;
  sizeBytes: number | bigint;
  mimeType: string;
  extension: string;
  description?: string | null;
}

export interface CertificateShareInfo {
  id: string;
  createdAt: Date;
  ownerName?: string;
  ownerEmail?: string;
}

export interface CertificateSystemInfo {
  hostname: string;
  ip?: string;
  platform: string;
  nodeVersion: string;
  storagePath: string;
}

export interface CertificateEmbedResult {
  originalHash: string;
  finalHash?: string;
  finalSize?: number;
}

const FONT = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

const execFileAsync = promisify(execFile);

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);

  constructor(
    @Inject(IUploadRepository)
    private readonly repository: IUploadRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Gera o hash SHA-256 de um arquivo no diretório do share.
   */
  async sha256OfShareFile(shareId: string, fileId: string): Promise<string> {
    return this.sha256OfRelativePath(`${shareId}/${fileId}`);
  }

  private async sha256OfRelativePath(relativePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = this.repository.createReadStream(relativePath);
      stream.on("error", reject);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
    });
  }

  /**
   * Embutir os metadados de certificação no próprio vídeo (in place): o
   * arquivo original é substituído pela versão com metadados, mantendo o mesmo
   * File record e o mesmo nome. O hash original (pré-embutido) e o hash final
   * (compartilhado) são retornados para constarem no certificado PDF.
   * Para arquivos que não são vídeo, não faz nada (retorna undefined).
   */
  async embedCertificateInVideo(
    shareId: string,
    fileId: string,
    fileName: string,
    share: CertificateShareInfo,
  ): Promise<CertificateEmbedResult | undefined> {
    const originalHash = await this.sha256OfShareFile(shareId, fileId);
    const ext = path.extname(fileName).toLowerCase();

    const videoExtensions = new Set([
      ".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".flv", ".wmv",
    ]);
    if (!videoExtensions.has(ext)) {
      this.logger.warn(
        `extensão "${ext}" do arquivo ${fileId} não suporta assinatura de vídeo; pulando`,
      );
      return undefined;
    }

    const verificationCode = crypto
      .createHash("sha256")
      .update(`${share.id}:${fileId}`)
      .digest("hex")
      .slice(0, 36);
    const formattedCode = `${verificationCode.slice(0, 8)}-${verificationCode.slice(8, 12)}-${verificationCode.slice(12, 16)}-${verificationCode.slice(16, 20)}-${verificationCode.slice(20, 32)}`;

    const comment = [
      "Certificado de autenticidade",
      `Código: ${formattedCode}`,
      `Hash SHA-256 (original): ${originalHash}`,
      `Share: ${share.id}`,
      `Proprietário: ${share.ownerName ?? "—"}`,
      `E-mail: ${share.ownerEmail ?? "—"}`,
    ].join(" | ");

    const srcRelPath = `${shareId}/${fileId}`;
    const outRelPath = `${shareId}/${fileId}.signed-tmp${ext}`;
    const srcPath = path.join(DATA_DIRECTORY, "uploads/shares", srcRelPath);
    const outPath = path.join(DATA_DIRECTORY, "uploads/shares", outRelPath);

    const baseArgs = [
      "-y",
      "-i", srcPath,
      "-metadata", `title=${fileName} (certificado)`,
      "-metadata", `comment=${comment}`,
      "-c", "copy",
    ];

    try {
      await execFileAsync("ffmpeg", [...baseArgs, outPath], {
        timeout: 120_000,
      });
      this.logger.log(
        `Vídeo ${shareId}/${fileId} com metadados embutidos (${outRelPath})`,
      );
    } catch (metaErr) {
      this.logger.error(
        `ffmpeg falhou ao embutir metadados no vídeo ${shareId}/${fileId}: ${
          metaErr instanceof Error ? metaErr.message : String(metaErr)
        }`,
      );
      await fs.promises.rm(outPath, { force: true }).catch(() => undefined);
      return undefined;
    }

    const stats = await fs.promises.stat(outPath);
    const finalHash = await this.sha256OfRelativePath(outRelPath);

    // Substitui o arquivo original pela versão com metadados (mesmo File record).
    await this.repository.moveFile(outRelPath, srcRelPath);

    await this.prisma.file.update({
      where: { id: fileId },
      data: { size: stats.size },
    });

    this.logger.log(
      `Vídeo ${shareId}/${fileId} certificado com metadados embutidos (${srcRelPath})`,
    );
    return { originalHash, finalHash, finalSize: stats.size };
  }

  private roundRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, r: number) {
    doc
      .moveTo(x + r, y)
      .lineTo(x + w - r, y)
      .quadraticCurveTo(x + w, y, x + w, y + r)
      .lineTo(x + w, y + h - r)
      .quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      .lineTo(x + r, y + h)
      .quadraticCurveTo(x, y + h, x, y + h - r)
      .lineTo(x, y + r)
      .quadraticCurveTo(x, y, x + r, y)
      .fill();
  }

  /**
   * Gera o certificado em PDF replicando o modelo de docs/certificado.pdf.
   * Salva em {shareId}/{fileId}.certificado.pdf dentro do diretório do share.
   * Retorna o caminho relativo e o hash do arquivo original.
   */
  async generateCertificate(
    shareId: string,
    fileId: string,
    file: CertificateFileInfo,
    share: CertificateShareInfo,
    system: CertificateSystemInfo,
    hashes?: { originalHash?: string; finalHash?: string },
    finalSizeBytes?: number | bigint,
  ): Promise<{ relativePath: string; hash: string }> {
    const originalHash =
      hashes?.originalHash ?? (await this.sha256OfShareFile(shareId, fileId));
    const finalHash =
      hashes?.finalHash && hashes.finalHash !== originalHash
        ? hashes.finalHash
        : undefined;
    const relativePath = `${shareId}/${fileId}.certificado.pdf`;
    const absPath = path.join(DATA_DIRECTORY, "uploads/shares", relativePath);

    await fs.promises.mkdir(path.dirname(absPath), { recursive: true });

    const now = dayjs();
    const nowLabel = now
      .tz(BRASILIA_TIMEZONE)
      .locale("pt-br")
      .format("DD [de] MMMM [de] YYYY, HH:mm:ss");
    const shareCreated = dayjs(share.createdAt)
      .tz(BRASILIA_TIMEZONE)
      .locale("pt-br")
      .format("DD [de] MMMM [de] YYYY, HH:mm:ss");

    const stream = fs.createWriteStream(absPath);
    const doc = new PDFDocument({
      size: "A4",
      layout: "portrait",
      margin: 50,
      info: {
        Title: `Certificado de Autenticidade - ${file.fileName}`,
        Author: share.ownerName ?? "Sistema",
        Subject: "Certificado de arquivo enviado",
      },
    });
    doc.pipe(stream);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    // Fundo verde-água claro (modelo ~#F5FBF9)
    doc.rect(0, 0, pageWidth, pageHeight).fill("#F5FBF9");

    // Faixa superior decorativa
    doc.rect(0, 0, pageWidth, 18).fill("#2E8B8B");

    // Layout de página única: margens laterais de 50pt e largura de conteúdo
    // centralizada na página. Centralizar via x=centerX com width desloca o
    // texto para a direita (o PDFKit centraliza DENTRO de [x, x+width]).
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;

    const centerText = (
      text: string,
      y: number,
      options: { fontSize?: number; color?: string; bold?: boolean } = {},
    ) => {
      const { fontSize = 10, color = "#333333", bold = false } = options;
      doc
        .font(bold ? FONT_BOLD : FONT)
        .fillColor(color)
        .fontSize(fontSize)
        .text(text, margin, y, {
          align: "center",
          width: contentWidth,
          lineBreak: false,
        });
    };

    // Cabeçalho padrão: logo (Secretaria de Defesa Social) + texto + brasão da
    // Guarda Municipal de Londrina, com o nome centralizado na linha abaixo.
    const logoPath = path.join(CERTIFICATE_ASSETS_DIRECTORY, "logo_pml_fb.png");
    const brasaoPath = path.join(CERTIFICATE_ASSETS_DIRECTORY, "Brasao_GML.png");

    const brasaoH = 46;
    const brasaoW = (brasaoH * 820) / 963; // 820x963
    const headerGap = 16;
    const headerText = "SECRETARIA DE DEFESA SOCIAL";
    const headerTextSize = 22;
    doc.font(FONT_BOLD).fontSize(headerTextSize);
    const headerTextW = doc.widthOfString(headerText);
    const logoW = Math.min(100, contentWidth - headerTextW - headerGap * 2 - brasaoW);
    const logoH = (logoW * 51) / 160; // 160x51
    const headerTotalW = logoW + headerGap + headerTextW + headerGap + brasaoW;
    const headerX = margin + (contentWidth - headerTotalW) / 2;
    const headerY = 26;

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, headerX, headerY + (brasaoH - logoH) / 2, {
        width: logoW,
        height: logoH,
      });
    } else {
      this.logger.warn(`logo do cabeçalho não encontrado: ${logoPath}`);
    }
    doc
      .font(FONT_BOLD)
      .fillColor("#333333")
      .fontSize(headerTextSize)
      .text(
        headerText,
        headerX + logoW + headerGap,
        headerY + (brasaoH - headerTextSize * 1.2) / 2,
        { width: headerTextW, align: "center", lineBreak: false },
      );
    if (fs.existsSync(brasaoPath)) {
      doc.image(
        brasaoPath,
        headerX + logoW + headerGap + headerTextW + headerGap,
        headerY,
        { width: brasaoW, height: brasaoH },
      );
    } else {
      this.logger.warn(`brasão do cabeçalho não encontrado: ${brasaoPath}`);
    }

    centerText("Guarda Municipal de Londrina", headerY + brasaoH + 8, {
      fontSize: 13,
      color: "#2E8B8B",
      bold: true,
    });

    // Título
    centerText("Certificado de Autenticidade", 104, { fontSize: 22, bold: true });

    // Data/hora de geração
    centerText(`Arquivo gerado em ${nowLabel}`, 132, { fontSize: 10, color: "#555555" });
    centerText("Datas e horários baseados em horário de Brasília - Brasil", 145, {
      fontSize: 9,
      color: "#777777",
    });

    // Nome do documento em destaque
    this.roundRect(doc, 60, 156, pageWidth - 120, 34, 8);
    doc.fillColor("#2E8B8B").font(FONT_BOLD).fontSize(14);
    doc.text(file.fileName, margin, 164, {
      align: "center",
      width: contentWidth,
      lineBreak: false,
    });

    // Código de verificação (UUID baseado no hash)
    const verificationCode = crypto
      .createHash("sha256")
      .update(`${share.id}:${fileId}`)
      .digest("hex")
      .slice(0, 36);
    const formattedCode = `${verificationCode.slice(0, 8)}-${verificationCode.slice(8, 12)}-${verificationCode.slice(12, 16)}-${verificationCode.slice(16, 20)}-${verificationCode.slice(20, 32)}`;

    centerText(`Código para verificação: ${formattedCode}`, 200, { fontSize: 10 });

    // Cartão de metadados
    let y = 226;
    const rowHeight = 16;
    // Coluna de valores após o label mais largo ("Caminho de armazenamento:"
    // termina em ~205pt). Se ficar em 175, labels longos como "Hash final
    // (pós-metadados):" e "Caminho de armazenamento:" sobrepõem o valor.
    const valueX = 210;
    const drawLabel = (label: string, value: string, fontSize = 10) => {
      doc.fillColor("#2E8B8B").font(FONT_BOLD).fontSize(10).text(label, 65, y);
      doc.fillColor("#333333").font(FONT).fontSize(fontSize).text(value, valueX, y, { lineBreak: false });
      y += rowHeight;
    };

    drawLabel("Documento ID:", share.id);
    drawLabel("Arquivo ID:", fileId);
    drawLabel("Proprietário:", share.ownerName ?? "—");
    drawLabel("E-mail:", share.ownerEmail ?? "—");
    drawLabel("Criado em:", shareCreated);
    drawLabel("Tamanho:", `${file.sizeBytes.toString()} bytes`);
    if (finalSizeBytes && finalSizeBytes.toString() !== file.sizeBytes.toString()) {
      drawLabel("Tamanho final:", `${finalSizeBytes.toString()} bytes`);
    }
    drawLabel("Extensão:", file.extension || "—");
    drawLabel("Tipo (MIME):", file.mimeType || "—");
    drawLabel("Descrição:", file.description ?? "—");

    // Hash SHA-256 (64 caracteres hex): fonte reduzida para caber inteiro na
    // largura disponível (valueX até a margem direita) sem quebrar a linha.
    drawLabel("Hash SHA-256:", originalHash, 9);
    if (finalHash) {
      drawLabel("Hash final (pós-metadados):", finalHash, 9);
    }

    // Dados do sistema
    y += 22;
    doc.rect(55, y, pageWidth - 110, 2).fillColor("#CCCCCC").fill();
    y += 10;
    doc.fillColor("#2E8B8B").font(FONT_BOLD).fontSize(11).text("Dados do sistema", 65, y);
    y += 16;

    const sysEntries: [string, string][] = [
      ["Hostname:", system.hostname],
      ["IP:", system.ip ?? "—"],
      ["Plataforma:", system.platform],
      ["Node.js:", system.nodeVersion],
      ["Caminho de armazenamento:", system.storagePath],
    ];
    for (const [label, value] of sysEntries) {
      doc.fillColor("#2E8B8B").font(FONT_BOLD).fontSize(10).text(label, 65, y);
      doc.fillColor("#333333").font(FONT).fontSize(10).text(value, valueX, y, { lineBreak: false });
      y += rowHeight;
    }

    // Eventos do documento
    y += 10;
    doc.rect(55, y, pageWidth - 110, 2).fillColor("#CCCCCC").fill();
    y += 10;
    doc.fillColor("#2E8B8B").font(FONT_BOLD).fontSize(11).text("Eventos do documento", 65, y);
    y += 16;

    const eventEntries: [string, string][] = [
      ["DOCUMENTO CRIADO", `${shareCreated}\n${share.ownerName ?? "—"} (${share.ownerEmail ?? "—"})`],
      ["ARQUIVO ENVIADO", `${nowLabel}\nSistema (upload finalizado)`],
      // Hash completo (64 caracteres hex) em fonte menor para caber inteiro na
      // largura disponível (230 até a margem direita) sem quebrar a linha.
      ["CERTIFICADO GERADO", `${nowLabel}\nHash SHA-256: ${originalHash}`],
    ];
    for (const [event, details] of eventEntries) {
      doc.fillColor("#2E8B8B").font(FONT_BOLD).fontSize(10).text(event, 65, y);
      doc.fillColor("#333333").font(FONT).fontSize(8).text(details, 230, y, {
        lineBreak: true,
        width: pageWidth - 230 - margin,
      });
      y += 38;
    }

    // Rodapé fixo no fim da página. y deve respeitar o limite de texto do
    // PDFKit (pageHeight - margin), senão ele cria uma nova página.
    doc.fillColor("#999999").fontSize(8).font(FONT);
    doc.text(
      `Gerado por ${system.hostname} em ${nowLabel} — horário de Brasília - Brasil`,
      margin,
      pageHeight - margin - 12,
      { align: "center", width: contentWidth, lineBreak: false },
    );

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    // Registrar certificado como File no banco para aparecer na UI
    const stats = await fs.promises.stat(absPath);
    await this.prisma.file.create({
      data: {
        name: `${file.fileName}.certificado.pdf`,
        size: stats.size,
        description: `Certificado SHA-256 de ${file.fileName}`,
        share: { connect: { id: shareId } },
      },
    });

    this.logger.log(`Certificado gerado para share ${shareId} arquivo ${fileId} (hash ${originalHash.slice(0, 12)}…)`);
    return { relativePath, hash: originalHash };
  }
}
