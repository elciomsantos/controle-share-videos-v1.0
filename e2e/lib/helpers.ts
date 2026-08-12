import { Page, test as base, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { E2E_ADMIN, BASE_URL } from "../lib/env";

export interface UploadFileSpec {
  name: string;
  content: string;
}

export async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE_URL}/auth/signIn`);
  await expect(page.getByRole("heading", { name: /Bem-vindo/ })).toBeVisible();
  await page.getByPlaceholder("Seu e-mail ou nome de usuário").fill(E2E_ADMIN.email);
  await page.getByPlaceholder("A sua senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Iniciar sessão" }).click();

  // Aguarda o login concluir (POST + refreshUser + redirect). Garante que os
  // cookies de sessão já estejam gravados antes de navegações subsequentes.
  await expect(page.getByRole("button", { name: "Carregar Videos" })).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Faz upload de um ou mais arquivos via UI (fluxo completo) e retorna o id do
 * compartilhamento criado. Assume que já está autenticado e na /upload.
 */
export async function uploadFiles(
  page: Page,
  files: UploadFileSpec[],
): Promise<string> {
  // Log de respostas com erro para diagnóstico direto no output do teste.
  page.on("response", (res) => {
    if (res.status() >= 400) {
      console.log(
        "[e2e-resp]",
        res.status(),
        res.request().method(),
        res.url(),
      );
    }
  });

  await page.goto(`${BASE_URL}/upload`);

  // Espera a página de upload carregar (botão "Carregar Videos").
  await expect(page.getByRole("button", { name: "Carregar Videos" })).toBeVisible();

  // Define os arquivos no input oculto de arquivos (webkitdirectory). Para inputs
  // com webkitdirectory o Playwright exige um diretório real no disco.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-upload-"));
  for (const f of files) {
    fs.writeFileSync(path.join(tmpDir, f.name), f.content);
  }
  await page.locator('input[type="file"]').setInputFiles(tmpDir);

  // Com autoOpenShareModal=true, o modal de criação abre automaticamente.
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();

  // Preenche o nome do compartilhamento (placeholder fixo) e envia. A seção
  // "Nome e descrição" do modal abre colapsada; expande antes de preencher.
  // ATENÇÃO: a descrição tem limite de 30 caracteres no formulário — texto
  // acima disso deixa o form inválido e o botão "Carregar" não envia.
  await modal.getByRole("button", { name: "Nome e descrição" }).click();
  const shortDescription = `Share ${files[0].name}`.slice(0, 30);
  await page
    .getByPlaceholder("Descrição do compartilhamento")
    .fill(shortDescription);

  await submitAndWaitForCompletion(page);

  // Extrai o id do share do campo "Vincular" (contém a URL /share/<id>).
  const linkValue = await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Vincular" })
    .inputValue();
  const match = linkValue.match(/\/share\/([A-Za-z0-9_-]+)/);
  if (!match) {
    throw new Error(`[e2e] não foi possível extrair o share id do modal. Texto: ${linkValue}`);
  }
  // Fecha o modal para permitir navegação posterior.
  await page.getByRole("dialog").getByRole("button", { name: "Concluído" }).click();
  return match[1];
}

/**
 * Envia o formulário de criação e aguarda o modal de conclusão
 * ("Compartilhamento pronto"). O envio pode falhar por um 403 csrf_invalid
 * transiente (retry no axios resolve, mas em rajadas o backend rotaciona o
 * cookie e o create pode rejeitar). Se o modal de criação seguir aberto após 20s
 * (create falhou), envia de novo — o formulário permanece preenchido.
 */
async function submitAndWaitForCompletion(page: Page) {
  const completed = page.getByText("Compartilhamento pronto");
  const modal = page.getByRole("dialog");

  for (let attempt = 0; attempt < 4; attempt++) {
    if (await modal.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Carregar" }).click();
    }
    try {
      await completed.waitFor({ state: "visible", timeout: 20_000 });
      return;
    } catch {
      const createStillOpen = await modal.isVisible().catch(() => false);
      if (!createStillOpen) {
        // create ok; upload ainda em background — aguarda a conclusão.
        await completed.waitFor({ state: "visible", timeout: 60_000 });
        return;
      }
    }
  }
  await expect(completed).toBeVisible({ timeout: 60_000 });
}

/** Compat: upload de um único arquivo (um share). */
export async function uploadFile(page: Page, filename: string, content: string) {
  return uploadFiles(page, [{ name: filename, content }]);
}
