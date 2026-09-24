import fs from "node:fs/promises";
import path from "node:path";

import dayjs from "dayjs";

import {
  ArchivoStaging,
} from "./types.js";

import {
  leerArchivoSap,
} from "./xlsx-reader.js";

import {
  logger,
} from "../utils/logger.js";

export async function procesarRawSap(
  rawPath: string
): Promise<string> {
  logger.info(
    {
      archivo:
        rawPath,
    },
    "Procesando RAW SAP"
  );

  const resultado =
    leerArchivoSap(
      rawPath
    );

  const staging:
    ArchivoStaging = {
      metadata: {
        version:
          "1.0",

        fuente:
          "SAP_S4HANA",

        transaccion:
          "ZPP10I",

        reporte:
          "RECORRIDO",

        sociedad:
          "0135",

        archivoOrigen:
          path.basename(
            rawPath
          ),

        fechaProcesamiento:
          dayjs().toISOString(),

        hojaOrigen:
          "Data",

        filaEncabezadosOrigen:
          resultado
            .filaEncabezados,

        columnasDetectadas:
          resultado.columnas,

        totalRegistros:
          resultado
            .registros
            .length,
      },

      registros:
        resultado.registros,
    };

  const stagingDir =
    path.resolve(
      process.cwd(),
      "data",
      "staging"
    );

  await fs.mkdir(
    stagingDir,
    {
      recursive: true,
    }
  );

  const base =
    path.basename(
      rawPath,
      ".xlsx"
    );

  const destino =
    path.join(
      stagingDir,
      `${base}.json`
    );

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
    "STAGING generado"
  );

  return destino;
}