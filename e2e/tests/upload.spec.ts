import { test, expect } from "@playwright/test";
import { loginAsAdmin, uploadFile } from "../lib/helpers";

test.describe("Upload e compartilhamento (E2E)", () => {
  test("admin faz upload e cria um compartilhamento", async ({ page }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        console.log("[e2e-console]", msg.type(), msg.text());
      }
    });
    page.on("response", (res) => {
      if (res.status() >= 400 || res.url().includes("csrf-token")) {
        console.log("[e2e-resp]", res.status(), res.url());
      }
    });
    await loginAsAdmin(page);

    const shareId = await uploadFile(
      page,
      "arquivo-test.txt",
      "conteúdo de teste do E2E\n",
    );

    expect(shareId).toMatch(/^[A-Za-z0-9_-]{3,50}$/);
    // O modal de conclusão confirma o compartilhamento pronto.
    await expect(page.getByText("Compartilhamento pronto")).toBeVisible();
  });
});
