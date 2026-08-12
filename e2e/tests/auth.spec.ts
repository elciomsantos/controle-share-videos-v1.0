import { test, expect } from "@playwright/test";
import { E2E_ADMIN, BASE_URL } from "../lib/env";
import { loginAsAdmin } from "../lib/helpers";

test.describe("Autenticação (E2E)", () => {
  test("login com credenciais válidas redireciona para /upload", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/upload/);
    await expect(page.getByRole("button", { name: "Carregar Videos" })).toBeVisible();
  });

  test("login com senha inválida exibe erro no campo de senha", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/signIn`);
    await expect(page.getByRole("heading", { name: /Bem-vindo/ })).toBeVisible();

    await page.getByPlaceholder("Seu e-mail ou nome de usuário").fill(E2E_ADMIN.email);
    await page.getByPlaceholder("A sua senha").fill("senha-errada-123");
    await page.getByRole("button", { name: "Iniciar sessão" }).click();

    // Permanece na tela de login e exibe erro inline no campo de senha.
    await expect(page).toHaveURL(/\/auth\/signIn/);
    await expect(page.getByText(/e-mail|senha|inválid|não confere/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("página /upload exige autenticação (redireciona para login)", async ({ page }) => {
    await page.goto(`${BASE_URL}/upload`);
    await expect(page).toHaveURL(/\/auth\/signIn/, { timeout: 15_000 });
  });
});
