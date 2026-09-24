import { Page } from "playwright";

import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export async function loginSap(page: Page): Promise<void> {
  logger.info("Comprobando estado de autenticación SAP");

  await page.goto(env.SAP_URL, {
    waitUntil: "domcontentloaded",
  });

  const userInput = page.locator(
    'input[placeholder="Usuario"], input[type="text"]'
  ).first();

  const passwordInput = page.locator(
    'input[placeholder="Clave de acceso"], input[type="password"]'
  ).first();

  const loginButton = page.getByRole("button", {
    name: /Acceder al sistema/i,
  });

  const loginVisible =
    await userInput.isVisible().catch(() => false);

  if (!loginVisible) {
    logger.info("SAP ya se encuentra autenticado");
    return;
  }

  logger.info("Pantalla de login SAP detectada");

  await userInput.fill(env.SAP_USER);

  await passwordInput.fill(env.SAP_PASSWORD);

  logger.info("Credenciales SAP ingresadas");

  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    loginButton.click(),
  ]);

  logger.info("Solicitud de inicio de sesión enviada");

  await page.waitForTimeout(3000);

  const loginStillVisible =
    await userInput.isVisible().catch(() => false);

  if (loginStillVisible) {
    throw new Error(
      "SAP continúa mostrando la pantalla de login. " +
      "Verifique usuario, contraseña o política de autenticación."
    );
  }

  logger.info("Autenticación SAP completada");
}