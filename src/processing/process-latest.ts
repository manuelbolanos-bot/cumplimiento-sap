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
  logger,
} from "../utils/logger.js";

import {
  encontrarUltimoStaging,
} from "./find-latest-staging.js";

import {
  validarEventoProduccion,
} from "./validator.js";

import {
  normalizarEventoProduccion,
} from "./normalize-event.js";

import {
  generarEventId,
} from "./fingerprint.js";

async function main() {
  logger.info(
    "=================================="
  );

  logger.info(
    "PROCESAMIENTO STAGING"
  );

  logger.info(
    "=================================="
  );

  /*
   * 1. Encontrar último staging.
   */
  const stagingPath =
    await encontrarUltimoStaging();

  /*
   * 2. Leer JSON.
   */
  const contenido =
    await fs.readFile(
      stagingPath,
      "utf8"
    );

  const staging =
    JSON.parse(
      contenido
    ) as ArchivoStaging;

  logger.info(
    {
      registros:
        staging.registros.length,

      archivoOrigen:
        staging.metadata
          .archivoOrigen,
    },
    "STAGING cargado"
  );

  /*
   * 3. Contenedores.
   */
  const registrosFinales:
    EventoProduccionProcesado[] =
      [];

  const rechazados:
    RegistroRechazado[] =
      [];

  /*
   * IDs que ya vimos en ESTE archivo.
   *
   * Posteriormente esto se trasladará
   * a PostgreSQL.
   */
  const idsVistos =
    new Set<string>();

  let duplicadosExactos =
    0;

  /*
   * 4. Procesar fila por fila.
   */
  for (
    let index = 0;
    index <
    staging.registros.length;
    index++
  ) {
    const original =
      staging.registros[
        index
      ];

    /*
     * Normalizamos.
     */
    const evento =
      normalizarEventoProduccion(
        original
      );

    /*
     * Validamos.
     */
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

    /*
     * Generamos fingerprint.
     */
    const eventId =
      generarEventId(
        evento
      );

    /*
     * Duplicado exacto dentro
     * de esta misma extracción.
     */
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

  /*
   * 5. Construir PROCESSED.
   */
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

  /*
   * 6. Crear directorio.
   */
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

  /*
   * 7. Guardar con mismo nombre base.
   */
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

  /*
   * 8. Logs.
   */
  logger.info(
    {
      registrosEntrada:
        processed.metadata
          .registrosEntrada,

      registrosValidos:
        processed.metadata
          .registrosValidos,

      rechazados:
        processed.metadata
          .registrosRechazados,

      duplicados:
        processed.metadata
          .duplicadosExactos,

      registrosFinales:
        processed.metadata
          .registrosFinales,
    },
    "Resultado del procesamiento"
  );

  logger.info(
    {
      destino,
    },
    "Archivo PROCESSED generado"
  );

  if (
    registrosFinales.length >
    0
  ) {
    logger.info(
      {
        primerRegistro:
          registrosFinales[0],
      },
      "Primer registro procesado"
    );
  }

  logger.info(
    "=================================="
  );

  logger.info(
    "PROCESAMIENTO STAGING COMPLETADO"
  );

  logger.info(
    "=================================="
  );
}

main().catch(
  (error) => {
    logger.error(
      error,
      "Falló procesamiento STAGING"
    );

    process.exit(1);
  }
);