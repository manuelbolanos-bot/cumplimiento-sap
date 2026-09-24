import fs from "node:fs/promises";
import path from "node:path";

import dayjs from "dayjs";

import {
  ArchivoProcessed,
} from "../ingestion/types.js";

import {
  logger,
} from "../utils/logger.js";

import {
  contarEventos,
  insertarEventos,
} from "./events-repository.js";

import {
  encontrarUltimoProcessed,
} from "./find-latest-processed.js";

import {
  createDatabaseSchema,
} from "./schema.js";

import {
  completarSyncRun,
  crearSyncRun,
  fallarSyncRun,
} from "./sync-repository.js";

async function main() {
  logger.info(
    "=================================="
  );

  logger.info(
    "INGESTA SQLITE"
  );

  logger.info(
    "=================================="
  );

  createDatabaseSchema();

  logger.info(
    "Esquema SQLite verificado"
  );

  const processedPath =
    await encontrarUltimoProcessed();

  const contenido =
    await fs.readFile(
      processedPath,
      "utf8"
    );

  const processed =
    JSON.parse(
      contenido
    ) as ArchivoProcessed;

  logger.info(
    {
      registros:
        processed.registros.length,

      archivo:
        path.basename(
          processedPath
        ),
    },
    "PROCESSED cargado"
  );

  const startedAt =
    dayjs().toISOString();

  const syncId =
    crearSyncRun({
      archivoProcessed:
        path.basename(
          processedPath
        ),

      startedAt,

      registrosEntrada:
        processed.metadata
          .registrosEntrada,

      registrosRechazados:
        processed.metadata
          .registrosRechazados,
    });

  logger.info(
    {
      syncId,
    },
    "Ejecución de sincronización creada"
  );

  try {
    const resultado =
      insertarEventos(
        processed.registros
      );

    const finishedAt =
      dayjs().toISOString();

    completarSyncRun(
      syncId,
      {
        finishedAt,

        registrosNuevos:
          resultado.nuevos,

        registrosExistentes:
          resultado.existentes,
      }
    );

    const totalEventos =
      contarEventos();

    logger.info(
      {
        nuevos:
          resultado.nuevos,

        existentes:
          resultado.existentes,

        totalEventos,
      },
      "Resultado de ingesta SQLite"
    );

    logger.info(
      "=================================="
    );

    logger.info(
      "INGESTA SQLITE COMPLETADA"
    );

    logger.info(
      "=================================="
    );
  } catch (error) {
    const finishedAt =
      dayjs().toISOString();

    const mensaje =
      error instanceof Error
        ? error.message
        : String(error);

    fallarSyncRun(
      syncId,
      {
        finishedAt,

        errorMessage:
          mensaje,
      }
    );

    throw error;
  }
}

main().catch(
  (error) => {
    logger.error(
      error,
      "Falló ingesta SQLite"
    );

    process.exit(1);
  }
);