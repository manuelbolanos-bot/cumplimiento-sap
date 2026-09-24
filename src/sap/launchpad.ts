import { Page } from "playwright";

import { logger } from "../utils/logger.js";

export async function openZpp10i(
  page: Page
): Promise<void> {
  logger.info("Esperando Fiori Launchpad");

  await page.waitForLoadState("domcontentloaded");

  await page.waitForTimeout(3000);

  logger.info("Buscando mosaico ZPP10I");

  const tile = page
    .getByText("ZPP10I CON TABLA DE FORMULAS", {
      exact: true,
    })
    .first();

  await tile.waitFor({
    state: "visible",
    timeout: 60000,
  });

  logger.info("Mosaico ZPP10I encontrado");

  await tile.click();

  logger.info("ZPP10I seleccionado");

  await page.waitForFunction(
    () =>
      document.title
        .toLowerCase()
        .includes("reporte de eventos por maquina"),
    undefined,
    {
      timeout: 90000,
    }
  );

  logger.info(
    {
      title: await page.title(),
      url: page.url(),
    },
    "ZPP10I cargado correctamente"
  );
}