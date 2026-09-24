import { Frame, Page } from "playwright";

import { logger } from "../utils/logger.js";

async function findRecorridoFormFrame(
  page: Page
): Promise<Frame | null> {
  const frames = page.frames();

  for (const frame of frames) {
    try {
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
    } catch {
      // SAP puede recrear frames.
    }
  }

  return null;
}

async function findFrameWithRecorrido(
  page: Page
): Promise<Frame> {
  logger.info("Buscando botón Recorrido");

  const limite = Date.now() + 60_000;
  let ultimoLog = 0;

  while (Date.now() < limite) {
    const formFrame = await findRecorridoFormFrame(page);

    if (formFrame) {
      logger.info(
        "SAP ya se encuentra en Reporte de Recorrido"
      );

      return formFrame;
    }

    const frames = page.frames();

    for (const frame of frames) {
      try {
        const boton = frame
          .getByText("Recorrido", {
            exact: true,
          })
          .first();

        const visible = await boton
          .isVisible()
          .catch(() => false);

        if (visible) {
          logger.info(
            {
              frameUrl: frame.url(),
            },
            "Botón Recorrido encontrado"
          );

          return frame;
        }
      } catch {
        // Seguimos buscando.
      }
    }

    if (Date.now() - ultimoLog >= 5000) {
      logger.info(
        {
          cantidadFrames: frames.length,
        },
        "Esperando controles de ZPP10I..."
      );

      ultimoLog = Date.now();
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    "No se encontró el botón Recorrido después de 60 segundos"
  );
}

async function waitForRecorridoForm(
  page: Page
): Promise<Frame> {
  logger.info(
    "Esperando formulario Reporte de Recorrido"
  );

  const limite = Date.now() + 60_000;
  let ultimoLog = 0;

  while (Date.now() < limite) {
    const frame = await findRecorridoFormFrame(page);

    if (frame) {
      logger.info(
        {
          title: await page.title(),
          frameUrl: frame.url(),
        },
        "Formulario Reporte de Recorrido detectado"
      );

      return frame;
    }

    if (Date.now() - ultimoLog >= 5000) {
      logger.info(
        "Esperando Sociedad y Fecha de Notificación..."
      );

      ultimoLog = Date.now();
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    "SAP no mostró Reporte de Recorrido después de 60 segundos"
  );
}

export async function openRecorrido(
  page: Page
): Promise<void> {
  logger.info(
    "Preparando apertura de Reporte de Recorrido"
  );

  const yaAbierto = await findRecorridoFormFrame(page);

  if (yaAbierto) {
    logger.info(
      "Reporte de Recorrido ya se encuentra abierto"
    );

    return;
  }

  const frame = await findFrameWithRecorrido(page);

  const formularioYaVisible =
    await findRecorridoFormFrame(page);

  if (formularioYaVisible) {
    logger.info(
      "Reporte de Recorrido ya fue cargado durante la espera"
    );

    return;
  }

  const boton = frame
    .getByText("Recorrido", {
      exact: true,
    })
    .first();

  logger.info("Haciendo clic en Recorrido");

  await boton.click();

  logger.info("Recorrido seleccionado");

  await waitForRecorridoForm(page);

  logger.info(
    "Reporte de Recorrido abierto correctamente"
  );
}