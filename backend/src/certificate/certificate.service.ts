import { Inject, Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import PDFDocument from "pdfkit";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";
import { IUploadRepository } from "../storage/upload-repository.interface";
import { DATA_DIRECTORY } from "../constants";
import { PrismaService } from "../prisma/prisma.service";

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

const FONT = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

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
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = this.repository.createReadStream(`${shareId}/${fileId}`);
      stream.on("error", reject);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
    });
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
  ): Promise<{ relativePath: string; hash: string }> {
    const hash = await this.sha256OfShareFile(shareId, fileId);
    const relativePath = `${shareId}/${fileId}.certificado.pdf`;
    const absPath = path.join(DATA_DIRECTORY, "uploads/shares", relativePath);

    await fs.promises.mkdir(path.dirname(absPath), { recursive: true });

    const now = dayjs().locale("pt-br");
    const nowLabel = now.format("DD [de] MMMM [de] YYYY, HH:mm:ss");
    const shareCreated = dayjs(share.createdAt)
      .locale("pt-br")
      .format("DD [de] MMMM [de] YYYY, HH:mm:ss");

    const stream = fs.createWriteStream(absPath);
    const doc = new PDFDocument({
      size: "A4",
      layout: "portrait",
      margin: 50,
      info: {
        Title: `Certificado de assinaturas - ${file.fileName}`,
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

    const centerX = pageWidth / 2;

    // Título
    doc.font(FONT_BOLD).fillColor("#333333").fontSize(24);
    doc.text("Certificado de assinaturas", centerX, 70, { align: "center", width: pageWidth - 100 });

    // Data/hora de geração
    doc.font(FONT).fillColor("#555555").fontSize(11);
    doc.text(`Arquivo gerado em ${nowLabel}`, centerX, 108, { align: "center", width: pageWidth - 100 });
    doc.fontSize(9).fillColor("#777777");
    doc.text("Datas e horários baseados em horário de Brasília - Brasil", centerX, 124, { align: "center", width: pageWidth - 100 });

    // Nome do documento em destaque
    this.roundRect(doc, 60, 150, pageWidth - 120, 46, 8);
    doc.fillColor("#2E8B8B").fontSize(16).font(FONT_BOLD);
    doc.text(file.fileName, centerX, 162, { align: "center", width: pageWidth - 140 });

    // Código de verificação (UUID baseado no hash)
    const verificationCode = crypto
      .createHash("sha256")
      .update(`${share.id}:${fileId}`)
      .digest("hex")
      .slice(0, 36);
    const formattedCode = `${verificationCode.slice(0, 8)}-${verificationCode.slice(8, 12)}-${verificationCode.slice(12, 16)}-${verificationCode.slice(16, 20)}-${verificationCode.slice(20, 32)}`;

    doc.fillColor("#333333").font(FONT).fontSize(10);
    doc.text(`Código para verificação: ${formattedCode}`, centerX, 220, { align: "center", width: pageWidth - 100 });

    // Cartão de metadados
    let y = 255;
    const drawLabel = (label: string, value: string) => {
      doc.fillColor("#2E8B8B").font(FONT_BOLD).fontSize(10).text(label, 65, y);
      doc.fillColor("#333333").font(FONT).fontSize(10).text(value, 175, y);
      y += 20;
    };

    drawLabel("Documento ID:", share.id);
    drawLabel("Arquivo ID:", fileId);
    drawLabel("Proprietário:", share.ownerName ?? "—");
    drawLabel("E-mail:", share.ownerEmail ?? "—");
    drawLabel("Criado em:", shareCreated);
    drawLabel("Tamanho:", `${file.sizeBytes.toString()} bytes`);
    drawLabel("Extensão:", file.extension || "—");
    drawLabel("Tipo (MIME):", file.mimeType || "—");
    drawLabel("Descrição:", file.description ?? "—");

    // Hash SHA-256
    const hashLabel = "Hash SHA-256:";
    doc.fillColor("#2E8B8B").font(FONT_BOLD).fontSize(10).text(hashLabel, 65, y);
    doc.fillColor("#333333").font(FONT).fontSize(10).text(hash, 175, y);

    // Dados do sistema
    y += 46;
    doc.rect(55, y, pageWidth - 110, 2).fillColor("#CCCCCC").fill();
    y += 14;
    doc.fillColor("#2E8B8B").font(FONT_BOLD).fontSize(12).text("Dados do sistema", 65, y);
    y += 22;

    const sysEntries: [string, string][] = [
      ["Hostname:", system.hostname],
      ["IP:", system.ip ?? "—"],
      ["Plataforma:", system.platform],
      ["Node.js:", system.nodeVersion],
      ["Caminho de armazenamento:", system.storagePath],
    ];
    for (const [label, value] of sysEntries) {
      doc.fillColor("#2E8B8B").font(FONT_BOLD).fontSize(10).text(label, 65, y);
      doc.fillColor("#333333").font(FONT).fontSize(10).text(value, 175, y);
      y += 20;
    }

    // Eventos do documento
    y += 16;
    doc.rect(55, y, pageWidth - 110, 2).fillColor("#CCCCCC").fill();
    y += 14;
    doc.fillColor("#2E8B8B").font(FONT_BOLD).fontSize(12).text("Eventos do documento", 65, y);
    y += 24;

    const eventEntries: [string, string][] = [
      ["DOCUMENTO CRIADO", `${shareCreated}\n${share.ownerName ?? "—"} (${share.ownerEmail ?? "—"})`],
      ["ARQUIVO ENVIADO", `${nowLabel}\nSistema (upload finalizado)`],
      ["CERTIFICADO GERADO", `${nowLabel}\nHash SHA-256: ${hash.slice(0, 20)}…`],
    ];
    for (const [event, details] of eventEntries) {
      doc.fillColor("#2E8B8B").font(FONT_BOLD).fontSize(10).text(event, 65, y);
      doc.fillColor("#333333").font(FONT).fontSize(9).text(details, 230, y);
      y += 48;
    }

    // Rodapé
    doc.fillColor("#999999").fontSize(8).font(FONT);
    doc.text(
      `Gerado por ${system.hostname} em ${nowLabel} — horário de Brasília - Brasil`,
      centerX,
      pageHeight - 50,
      { align: "center", width: pageWidth - 100 },
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

    this.logger.log(`Certificado gerado para share ${shareId} arquivo ${fileId} (hash ${hash.slice(0, 12)}…)`);
    return { relativePath, hash };
  }
}
