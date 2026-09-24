import fs from "node:fs/promises";
import path from "node:path";

import dayjs from "dayjs";

import {
  ArchivoProcessed,
} from "../ingestion/types.js";

import {
  contarEventos,
  insertarEventos,
} from "./events-repository.js";

import {
  createDatabaseSchema,
} from "./schema.js";

import {
  completarSyncRun,
  crearSyncRun,
  fallarSyncRun,
} from "./sync-repository.js";

import {
  db,
} from "./db.js";

import {
  logger,
} from "../utils/logger.js";

/* =========================================================
   RESULTADO DE INGESTA
========================================================= */

export interface ResultadoIngesta {
  nuevos: number;

  existentes: number;

  /*
   * Cantidad de eventos anteriores
   * eliminados por pertenecer a las fechas
   * que están siendo reimportadas.
   */
  reemplazados: number;

  /*
   * Cantidad de fechas afectadas
   * por la reimportación.
   */
  fechasReemplazadas: number;

  totalEventos: number;

  syncId: number;
}

/* =========================================================
   CONFIGURACION
========================================================= */

/*
 * Fuente oficial para este flujo.
 *
 * Cuando existan otras fuentes,
 * esta lógica podrá parametrizarse.
 */
const FUENTE =
  "SAP_ZPP10I";

/* =========================================================
   EXTRAER FECHAS DEL PROCESSED
========================================================= */

function obtenerFechasProcessed(
  processed: ArchivoProcessed
): string[] {
  const fechas =
    processed.registros
      .map(
        (registro) =>
          registro.fechaReporte
      )
      .filter(
        (
          fecha
        ): fecha is string =>
          typeof fecha ===
            "string" &&
          fecha.trim().length >
            0
      )
      .map(
        (fecha) =>
          fecha.trim()
      );

  const unicas =
    Array.from(
      new Set(
        fechas
      )
    ).sort();

  if (
    unicas.length === 0
  ) {
    throw new Error(
      "El archivo processed no contiene fechas válidas para realizar la ingesta."
    );
  }

  return unicas;
}

/* =========================================================
   VALIDACION BASICA DE FECHAS

   La validación fuerte ya ocurre en el pipeline.
   Aquí agregamos una segunda barrera de seguridad
   para impedir borrados con valores inesperados.
========================================================= */

function validarFechas(
  fechas: string[]
): void {
  const patron =
    /^\d{4}-\d{2}-\d{2}$/;

  for (
    const fecha of fechas
  ) {
    if (
      !patron.test(
        fecha
      )
    ) {
      throw new Error(
        `Fecha inválida detectada antes de reemplazar datos: ${fecha}`
      );
    }
  }
}

/* =========================================================
   REEMPLAZO TRANSACCIONAL POR FECHA

   Regla histórica:

   Si vuelve a entrar una fecha,
   se elimina únicamente esa fecha
   para SAP_PRINCIPAL y se carga
   nuevamente desde el archivo actual.

   NO se elimina el mes completo.
   NO se eliminan otras fuentes.
========================================================= */

function reemplazarEventosPorFecha(
  processed: ArchivoProcessed,
  fechas: string[]
): {
  nuevos: number;
  existentes: number;
  reemplazados: number;
} {
  /*
   * Contamos lo que existía antes
   * de borrar para dejar auditoría.
   */
  const contarPorFecha =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM
        events

      WHERE
        fuente = ?

        AND fecha_reporte = ?
    `);

  const eliminarPorFecha =
    db.prepare(`
      DELETE FROM events

      WHERE
        fuente = ?

        AND fecha_reporte = ?
    `);

  /*
   * Toda la operación crítica queda
   * dentro de una sola transacción.
   *
   * Si insertarEventos falla,
   * SQLite revierte también los DELETE.
   */
  const transaccion =
    db.transaction(() => {
      let reemplazados =
        0;

      for (
        const fecha of fechas
      ) {
        const existente =
          contarPorFecha.get(
            FUENTE,
            fecha
          ) as {
            total: number;
          };

        reemplazados +=
          Number(
            existente.total ??
            0
          );

        eliminarPorFecha.run(
          FUENTE,
          fecha
        );
      }

      /*
       * Después de limpiar únicamente
       * las fechas correspondientes,
       * cargamos la versión nueva.
       */
      const resultado =
        insertarEventos(
          processed.registros
        );

      return {
        nuevos:
          resultado.nuevos,

        existentes:
          resultado.existentes,

        reemplazados,
      };
    });

  return transaccion();
}

/* =========================================================
   INGESTA
========================================================= */

export async function ingerirProcessed(
  processedPath: string
): Promise<ResultadoIngesta> {
  createDatabaseSchema();

  const contenido =
    await fs.readFile(
      processedPath,
      "utf8"
    );

  const processed =
    JSON.parse(
      contenido
    ) as ArchivoProcessed;

  /*
   * Seguridad adicional:
   *
   * jamás hacemos DELETE si el processed
   * no contiene registros.
   */
  if (
    !Array.isArray(
      processed.registros
    ) ||
    processed.registros.length ===
      0
  ) {
    throw new Error(
      "El archivo processed no contiene registros. Se canceló la ingesta para evitar eliminar información existente."
    );
  }

  const fechas =
    obtenerFechasProcessed(
      processed
    );

  validarFechas(
    fechas
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

  try {
    logger.info(
      {
        fuente:
          FUENTE,

        fechas:
          fechas.length,

        fechaDesde:
          fechas[0],

        fechaHasta:
          fechas[
            fechas.length -
              1
          ],

        registros:
          processed.registros
            .length,
      },
      "Preparando reemplazo transaccional por fecha"
    );

    const resultado =
      reemplazarEventosPorFecha(
        processed,
        fechas
      );

    const totalEventos =
      contarEventos();

    completarSyncRun(
      syncId,
      {
        finishedAt:
          dayjs().toISOString(),

        registrosNuevos:
          resultado.nuevos,

        registrosExistentes:
          resultado.existentes,
      }
    );

    logger.info(
      {
        syncId,

        fuente:
          FUENTE,

        fechasReemplazadas:
          fechas.length,

        fechaDesde:
          fechas[0],

        fechaHasta:
          fechas[
            fechas.length -
              1
          ],

        reemplazados:
          resultado.reemplazados,

        nuevos:
          resultado.nuevos,

        existentes:
          resultado.existentes,

        totalEventos,
      },
      "Ingesta SQLite completada con reemplazo por fecha"
    );

    return {
      nuevos:
        resultado.nuevos,

      existentes:
        resultado.existentes,

      reemplazados:
        resultado.reemplazados,

      fechasReemplazadas:
        fechas.length,

      totalEventos,

      syncId,
    };

  } catch (error) {
    const mensaje =
      error instanceof Error
        ? error.message
        : String(
            error
          );

    fallarSyncRun(
      syncId,
      {
        finishedAt:
          dayjs().toISOString(),

        errorMessage:
          mensaje,
      }
    );

    logger.error(
      {
        syncId,

        error:
          mensaje,
      },
      "Falló ingesta transaccional SQLite"
    );

    throw error;
  }
}