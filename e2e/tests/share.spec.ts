import { test, expect, type Download } from "@playwright/test";
import { loginAsAdmin, uploadFiles } from "../lib/helpers";
import { BASE_URL } from "../lib/env";

test.describe("Página pública de compartilhamento (E2E)", () => {
  test("arquivo carregado aparece e pode ser baixado individualmente", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const shareId = await uploadFiles(page, [
      { name: "arquivo-download.txt", content: "download e2e\n" },
    ]);
    expect(shareId).toMatch(/^[A-Za-z0-9_-]{3,50}$/);

    // Abre a página pública do compartilhamento (mesmo contexto, sessão ativa).
    const publicPage = await page.context().newPage();
    await publicPage.goto(`${BASE_URL}/share/${shareId}`);

    // O arquivo deve aparecer na listagem (linha da tabela).
    const row = publicPage
      .getByRole("row")
      .filter({ hasText: "arquivo-download.txt" })
      .filter({ hasNotText: ".certificado.pdf" });
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Download individual: último ActionIcon da linha (botão de download).
    const downloadPromise = publicPage.waitForEvent("download", {
      timeout: 45_000,
    });
    await row.getByRole("button").last().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBeTruthy();

    await publicPage.close();
  });

  test("Transferir tudo (download-all) disponível para múltiplos arquivos", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const shareId = await uploadFiles(page, [
      { name: "arquivo-a.txt", content: "aaa\n" },
      { name: "arquivo-b.txt", content: "bbb\n" },
    ]);
    expect(shareId).toMatch(/^[A-Za-z0-9_-]{3,50}$/);

    const publicPage = await page.context().newPage();
    await publicPage.goto(`${BASE_URL}/share/${shareId}`);

    // Ambos os arquivos listados.
    await expect(
      publicPage.getByText("arquivo-a.txt", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      publicPage.getByText("arquivo-b.txt", { exact: true }),
    ).toBeVisible();

    // "Transferir tudo" só renderiza quando há mais de um arquivo
    // (index.tsx: share.files.length > 1).
    const downloadAll = publicPage.getByRole("button", {
      name: "Transferir tudo",
    });
    await expect(downloadAll).toBeVisible();

    // O botão desabilita o download enquanto o zip não está pronto (toast de
    // "está sendo preparado"). Tentamos em até ~2min até o download disparar.
    let download: Download | undefined;
    for (let attempt = 0; attempt < 24; attempt++) {
      const promise = publicPage.waitForEvent("download", {
        timeout: 5_000,
      });
      await downloadAll.click();
      try {
        download = await promise;
        break;
      } catch {
        // zip ainda não pronto — tenta de novo no próximo ciclo de polling.
      }
    }
    expect(download, "download-all deveria disparar o zip").toBeDefined();

    await publicPage.close();
  });
});