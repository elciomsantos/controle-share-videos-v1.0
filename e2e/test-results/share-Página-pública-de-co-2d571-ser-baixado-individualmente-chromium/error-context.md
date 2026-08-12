# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: share.spec.ts >> Página pública de compartilhamento (E2E) >> arquivo carregado aparece e pode ser baixado individualmente
- Location: tests/share.spec.ts:6:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('row').filter({ hasText: 'arquivo-download.txt' })
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByRole('row').filter({ hasText: 'arquivo-download.txt' })

```

```yaml
- heading [level=3]
- paragraph
- table:
  - rowgroup:
    - row "Nome Tamanho Descrição":
      - columnheader "Nome":
        - text: Nome
        - button:
          - img
      - columnheader "Tamanho":
        - text: Tamanho
        - button:
          - img
      - columnheader "Descrição":
        - text: Descrição
        - button:
          - img
      - columnheader
  - rowgroup:
    - row:
      - cell
      - cell
      - cell
      - cell
      - cell
    - row:
      - cell
      - cell
      - cell
      - cell
      - cell
    - row:
      - cell
      - cell
      - cell
      - cell
      - cell
    - row:
      - cell
      - cell
      - cell
      - cell
      - cell
    - row:
      - cell
      - cell
      - cell
      - cell
      - cell
- alert
```

# Test source

```ts
  1  | import { test, expect, type Download } from "@playwright/test";
  2  | import { loginAsAdmin, uploadFiles } from "../lib/helpers";
  3  | import { BASE_URL } from "../lib/env";
  4  | 
  5  | test.describe("Página pública de compartilhamento (E2E)", () => {
  6  |   test("arquivo carregado aparece e pode ser baixado individualmente", async ({
  7  |     page,
  8  |   }) => {
  9  |     await loginAsAdmin(page);
  10 | 
  11 |     const shareId = await uploadFiles(page, [
  12 |       { name: "arquivo-download.txt", content: "download e2e\n" },
  13 |     ]);
  14 |     expect(shareId).toMatch(/^[A-Za-z0-9_-]{3,50}$/);
  15 | 
  16 |     // Abre a página pública do compartilhamento (mesmo contexto, sessão ativa).
  17 |     const publicPage = await page.context().newPage();
  18 |     await publicPage.goto(`${BASE_URL}/share/${shareId}`);
  19 | 
  20 |     // O arquivo deve aparecer na listagem (linha da tabela).
  21 |     const row = publicPage
  22 |       .getByRole("row")
  23 |       .filter({ hasText: "arquivo-download.txt" });
> 24 |     await expect(row).toBeVisible({ timeout: 20_000 });
     |                       ^ Error: expect(locator).toBeVisible() failed
  25 | 
  26 |     // Download individual: último ActionIcon da linha (botão de download).
  27 |     const downloadPromise = publicPage.waitForEvent("download", {
  28 |       timeout: 45_000,
  29 |     });
  30 |     await row.getByRole("button").last().click();
  31 |     const download = await downloadPromise;
  32 |     expect(download.suggestedFilename()).toBeTruthy();
  33 | 
  34 |     await publicPage.close();
  35 |   });
  36 | 
  37 |   test("Transferir tudo (download-all) disponível para múltiplos arquivos", async ({
  38 |     page,
  39 |   }) => {
  40 |     await loginAsAdmin(page);
  41 | 
  42 |     const shareId = await uploadFiles(page, [
  43 |       { name: "arquivo-a.txt", content: "aaa\n" },
  44 |       { name: "arquivo-b.txt", content: "bbb\n" },
  45 |     ]);
  46 |     expect(shareId).toMatch(/^[A-Za-z0-9_-]{3,50}$/);
  47 | 
  48 |     const publicPage = await page.context().newPage();
  49 |     await publicPage.goto(`${BASE_URL}/share/${shareId}`);
  50 | 
  51 |     // Ambos os arquivos listados.
  52 |     await expect(
  53 |       publicPage.getByText("arquivo-a.txt", { exact: true }),
  54 |     ).toBeVisible({ timeout: 20_000 });
  55 |     await expect(
  56 |       publicPage.getByText("arquivo-b.txt", { exact: true }),
  57 |     ).toBeVisible();
  58 | 
  59 |     // "Transferir tudo" só renderiza quando há mais de um arquivo
  60 |     // (index.tsx: share.files.length > 1).
  61 |     const downloadAll = publicPage.getByRole("button", {
  62 |       name: "Transferir tudo",
  63 |     });
  64 |     await expect(downloadAll).toBeVisible();
  65 | 
  66 |     // O botão desabilita o download enquanto o zip não está pronto (toast de
  67 |     // "está sendo preparado"). Tentamos em até ~2min até o download disparar.
  68 |     let download: Download | undefined;
  69 |     for (let attempt = 0; attempt < 24; attempt++) {
  70 |       const promise = publicPage.waitForEvent("download", {
  71 |         timeout: 5_000,
  72 |       });
  73 |       await downloadAll.click();
  74 |       try {
  75 |         download = await promise;
  76 |         break;
  77 |       } catch {
  78 |         // zip ainda não pronto — tenta de novo no próximo ciclo de polling.
  79 |       }
  80 |     }
  81 |     expect(download, "download-all deveria disparar o zip").toBeDefined();
  82 | 
  83 |     await publicPage.close();
  84 |   });
  85 | });
```