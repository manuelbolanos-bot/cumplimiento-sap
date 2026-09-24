import fs from "node:fs/promises";
import path from "node:path";

import dayjs from "dayjs";

import { logger } from "../utils/logger.js";

import {
  encontrarUltimoRawSap,
} from "./find-latest-raw.js";

import {
  leerArchivoSap,
} from "./xlsx-reader.js";

import {
  ArchivoStaging,
} from "./types.js";

async function main() {
  logger.info(
    "=================================="
  );

  logger.info(
    "PROCESAMIENTO RAW SAP"
  );

  logger.info(
    "=================================="
  );

  /*
   * 1. Buscar archivo SAP más reciente.
   */
  const raw =
    await encontrarUltimoRawSap();

  /*
   * 2. Leer y validar.
   */
  const resultado =
    leerArchivoSap(
      raw
    );

  /*
   * 3. Crear estructura de staging.
   */
  const staging:
    ArchivoStaging = {
metadata: {
  version: "1.0",

  fuente:
    "SAP_S4HANA",

  transaccion:
    "ZPP10I",

  reporte:
    "RECORRIDO",

  sociedad:
    "0135",

  archivoOrigen:
    path.basename(raw),

  fechaProcesamiento:
    dayjs().toISOString(),

  hojaOrigen:
    "Data",

  filaEncabezadosOrigen:
    resultado.filaEncabezados,

  columnasDetectadas:
    resultado.columnas,

  totalRegistros:
    resultado.registros.length,
},

      registros:
        resultado.registros,
    };

  /*
   * 4. Crear directorio staging.
   */
  const stagingPath =
    path.resolve(
      process.cwd(),
      "data",
      "staging"
    );

  await fs.mkdir(
    stagingPath,
    {
      recursive: true,
    }
  );

  /*
   * Utilizamos el mismo nombre del RAW.
   */
  const base =
    path.basename(
      raw,
      ".xlsx"
    );

  const destino =
    path.join(
      stagingPath,
      `${base}.json`
    );

  /*
   * 5. Guardar JSON formateado.
   */
  await fs.writeFile(
    destino,
    JSON.stringify(
      staging,
      null,
      2
    ),
    "utf8"
  );

  logger.info(
    {
      destino,
      registros:
        staging.registros.length,
    },
    "Archivo staging generado"
  );

  /*
   * 6. Mostrar una muestra.
   */
  if (
    staging.registros.length >
    0
  ) {
    logger.info(
      {
        primerRegistro:
          staging.registros[0],
      },
      "Primer registro normalizado"
    );
  }

  logger.info(
    "=================================="
  );

  logger.info(
    "PROCESAMIENTO COMPLETADO"
  );

  logger.info(
    "=================================="
  );
}

main().catch(
  (error) => {
    logger.error(
      error,
      "Falló procesamiento RAW SAP"
    );

    process.exit(1);
  }
);