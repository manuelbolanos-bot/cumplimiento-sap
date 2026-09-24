import { Page } from "playwright";

import { logger } from "../utils/logger.js";

export async function inspectRecorrido(
  page: Page
): Promise<void> {
  logger.info("Inspeccionando campos de Reporte de Recorrido");

  /*
   * Buscamos el frame que realmente contiene la pantalla.
   */
  const limite = Date.now() + 30_000;

  while (Date.now() < limite) {
    const frames = page.frames();

    for (const frame of frames) {
      try {
        const bodyText = await frame
          .locator("body")
          .innerText()
          .catch(() => "");

        if (
          bodyText.includes("Sociedad") &&
          bodyText.includes("Fecha de Notificación")
        ) {
          logger.info(
            {
              url: frame.url(),
              name: frame.name(),
            },
            "Frame de Reporte de Recorrido encontrado"
          );

          const inputs = frame.locator(
            'input:not([type="hidden"])'
          );

          const cantidad = await inputs.count();

          logger.info(
            {
              cantidadInputs: cantidad,
            },
            "Inputs visibles encontrados"
          );

          for (let i = 0; i < cantidad; i++) {
            const input = inputs.nth(i);

            const datos = await input.evaluate((el) => {
              const e = el as HTMLInputElement;

              return {
                id: e.id,
                name: e.name,
                type: e.type,
                value: e.value,
                title: e.title,
                placeholder: e.placeholder,
                ariaLabel:
                  e.getAttribute("aria-label"),
              };
            });

            logger.info(
              {
                index: i,
                ...datos,
              },
              "Input"
            );
          }

          return;
        }
      } catch {
        // SAP puede estar actualizando un frame.
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    "No se encontró la pantalla Reporte de Recorrido"
  );
}