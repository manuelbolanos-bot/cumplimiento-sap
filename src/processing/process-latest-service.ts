import fs from "node:fs/promises";
import path from "node:path";

import dayjs from "dayjs";

import {
  ArchivoProcessed,
  ArchivoStaging,
  EventoProduccionProcesado,
  RegistroRechazado,
} from "../ingestion/types.js";

import {
  generarEventId,
} from "./fingerprint.js";

import {
  normalizarEventoProduccion,
} from "./normalize-event.js";

import {
  validarEventoProduccion,
} from "./validator.js";

import {
  logger,
} from "../utils/logger.js";

export async function procesarStaging(
  stagingPath: string
): Promise<string> {
  const contenido =
    await fs.readFile(
      stagingPath,
      "utf8"
    );

  const staging =
    JSON.parse(
      contenido
    ) as ArchivoStaging;

  const registrosFinales:
    EventoProduccionProcesado[] =
      [];

  const rechazados:
    RegistroRechazado[] =
      [];

  const idsVistos =
    new Set<string>();

  let duplicadosExactos =
    0;

  for (
    let index = 0;
    index <
    staging.registros.length;
    index++
  ) {
    const original =
      staging.registros[index];

    const evento =
      normalizarEventoProduccion(
        original
      );

    const validacion =
      validarEventoProduccion(
        evento
      );

    if (
      !validacion.valido
    ) {
      rechazados.push({
        indice:
          index,

        motivo:
          validacion.errores.join(
            "; "
          ),

        registro:
          evento,
      });

      continue;
    }

    const eventId =
      generarEventId(
        evento
      );

    if (
      idsVistos.has(
        eventId
      )
    ) {
      duplicadosExactos++;

      continue;
    }

    idsVistos.add(
      eventId
    );

    registrosFinales.push({
      ...evento,

      eventId,

      procesadoEn:
        dayjs().toISOString(),

      fuente:
        "SAP_ZPP10I",

      sociedad:
        staging.metadata
          .sociedad,
    });
  }

  const processed:
    ArchivoProcessed = {
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
          staging.metadata
            .sociedad,

        archivoStaging:
          path.basename(
            stagingPath
          ),

        fechaProcesamiento:
          dayjs().toISOString(),

        registrosEntrada:
          staging.registros
            .length,

        registrosValidos:
          registrosFinales
            .length,

        registrosRechazados:
          rechazados.length,

        duplicadosExactos,

        registrosFinales:
          registrosFinales
            .length,
      },

      registros:
        registrosFinales,

      rechazados,
    };

  const processedDir =
    path.resolve(
      process.cwd(),
      "data",
      "processed"
    );

  await fs.mkdir(
    processedDir,
    {
      recursive: true,
    }
  );

  const base =
    path.basename(
      stagingPath,
      ".json"
    );

  const destino =
    path.join(
      processedDir,
      `${base}.processed.json`
    );

  await fs.writeFile(
    destino,
    JSON.stringify(
      processed,
      null,
      2
    ),
    "utf8"
  );

  logger.info(
    {
      destino,

      entrada:
        processed.metadata
          .registrosEntrada,

      validos:
        processed.metadata
          .registrosValidos,

      rechazados:
        processed.metadata
          .registrosRechazados,

      duplicados:
        processed.metadata
          .duplicadosExactos,
    },
    "PROCESSED generado"
  );

  return destino;
}