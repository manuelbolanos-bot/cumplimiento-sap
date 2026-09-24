import { Frame, Page } from "playwright";

import { logger } from "../utils/logger.js";

async function findRecorridoFrame(
  page: Page
): Promise<Frame> {
  const limite = Date.now() + 30_000;

  while (Date.now() < limite) {
    for (const frame of page.frames()) {
      const texto = await frame
        .locator("body")
        .innerText()
        .catch(() => "");

      if (
        texto.includes("Sociedad") &&
        texto.includes("Fecha de Notificación")
      ) {
        return frame;
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    "No se encontró el formulario Reporte de Recorrido"
  );
}

async function waitForReporteGenerado(
  page: Page
): Promise<Frame> {
  logger.info("Esperando generación del reporte");

  const limite = Date.now() + 120_000;
  let ultimoLog = 0;

  while (Date.now() < limite) {
    for (const frame of page.frames()) {
      const texto = await frame
        .locator("body")
        .innerText()
        .catch(() => "");

      const tieneColumnas =
        texto.includes("Orden") &&
        texto.includes("Operador") &&
        texto.includes("Turno") &&
        texto.includes("Cod. Mat.");

      if (tieneColumnas) {
        logger.info(
          {
            title: await page.title(),
            frameUrl: frame.url(),
          },
          "Reporte generado correctamente"
        );

        return frame;
      }
    }

    if (Date.now() - ultimoLog >= 5000) {
      logger.info(
        "SAP todavía está procesando el reporte..."
      );

      ultimoLog = Date.now();
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    "El reporte no fue generado dentro de 120 segundos"
  );
}

export async function ejecutarRecorrido(
  page: Page
): Promise<void> {
  const frame = await findRecorridoFrame(page);

  logger.info("Buscando botón Ejecutar");

  const candidatos = [
    frame.getByText("Ejecutar", {
      exact: true,
    }),

    frame.locator(
      'button:has-text("Ejecutar")'
    ),

    frame.locator(
      '[role="button"]:has-text("Ejecutar")'
    ),

    frame.locator(
      '[title="Ejecutar"]'
    ),

    frame.locator(
      'input[value="Ejecutar"]'
    ),
  ];

  let botonEncontrado = null;

  for (const candidato of candidatos) {
    const cantidad = await candidato.count();

    for (let i = 0; i < cantidad; i++) {
      const elemento = candidato.nth(i);

      const visible = await elemento
        .isVisible()
        .catch(() => false);

      if (visible) {
        botonEncontrado = elemento;
        break;
      }
    }

    if (botonEncontrado) {
      break;
    }
  }

  if (!botonEncontrado) {
    throw new Error(
      "No se encontró el botón Ejecutar"
    );
  }

  logger.info("Botón Ejecutar encontrado");

  await botonEncontrado.click();

  logger.info(
    "Reporte enviado a ejecución"
  );

  await waitForReporteGenerado(page);

  logger.info(
    "Reporte de Recorrido disponible"
  );
}