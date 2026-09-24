import { Frame, Page } from "playwright";

import { logger } from "../utils/logger.js";

export async function findWebGuiFrame(
  page: Page
): Promise<Frame> {
  logger.info("Esperando frame de SAP WebGUI");

  const limite = Date.now() + 60_000;

  while (Date.now() < limite) {
    const frames = page.frames();

    for (const frame of frames) {
      const url = frame.url().toLowerCase();

      const pareceWebGui =
        url.includes("/sap/bc/gui/") ||
        url.includes("/sap/bc/gui/sap/its/") ||
        url.includes("webgui");

      if (!pareceWebGui) {
        continue;
      }

      try {
        await frame.locator("body").waitFor({
          state: "attached",
          timeout: 2000,
        });

        logger.info(
          {
            url: frame.url(),
          },
          "Frame SAP WebGUI disponible"
        );

        return frame;
      } catch {
        /*
         * El frame existe, pero todavía no está listo.
         * Seguimos esperando.
         */
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    "SAP WebGUI no estuvo disponible después de 60 segundos"
  );
}