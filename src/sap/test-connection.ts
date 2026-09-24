import { logger } from "../utils/logger.js";

import { openSapBrowser } from "./browser.js";
import { loginSap } from "./login.js";
import { openZpp10i } from "./launchpad.js";
import { openRecorrido } from "./recorrido.js";

import {
  completarParametrosRecorrido,
} from "./parametros-recorrido.js";

import {
  ejecutarRecorrido,
} from "./ejecutar-recorrido.js";

import {
  exportarRecorrido,
} from "./exportar-recorrido.js";

async function main() {
  logger.info(
    "=================================="
  );

  logger.info(
    "PRUEBA AUTOMATICA SAP"
  );

  logger.info(
    "=================================="
  );

  const {
    page,
  } = await openSapBrowser();

  try {
    await loginSap(page);

    logger.info(
      "Login SAP completado"
    );

    await openZpp10i(page);

    logger.info(
      "ZPP10I abierto"
    );

    await openRecorrido(page);

    logger.info(
      "Recorrido abierto"
    );

    await completarParametrosRecorrido(
      page
    );

    logger.info(
      "Parámetros de Recorrido completados"
    );

    await ejecutarRecorrido(page);

    logger.info(
      "Reporte generado correctamente"
    );

    const archivo =
      await exportarRecorrido(
        page
      );

    logger.info(
      {
        archivo,
      },
      "Exportación SAP completada"
    );

    logger.info(
      "=================================="
    );

    logger.info(
      "PRUEBA PUNTA A PUNTA COMPLETADA"
    );

    logger.info(
      "=================================="
    );

    logger.info(
      "El navegador permanecerá abierto."
    );

    await new Promise(() => {});
  } catch (error) {
    logger.error(
      error,
      "Falló la prueba SAP"
    );

    logger.warn(
      "El navegador permanecerá abierto para diagnóstico."
    );

    await new Promise(() => {});
  }
}

main();