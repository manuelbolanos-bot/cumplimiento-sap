import {
  EventoProduccionProcesado,
} from "../ingestion/types.js";

import { db } from "./db.js";

export interface ResultadoInsercion {
  nuevos: number;
  existentes: number;
}

/* =========================================================
   INSERTAR EVENTOS
========================================================= */

export function insertarEventos(
  eventos: EventoProduccionProcesado[]
): ResultadoInsercion {
  /*
   * IMPORTANTE:
   *
   * El statement se prepara aquí dentro,
   * no al importar el módulo.
   *
   * Para cuando esta función sea llamada,
   * createDatabaseSchema() ya habrá creado
   * la tabla events.
   */
  const insertStatement =
    db.prepare(`
      INSERT OR IGNORE INTO events (
        event_id,

        orden,
        operador,
        turno,

        codigo_material,
        pedido,
        posicion,

        nombre_material,

        fecha_reporte,
        fecha_reporte_original,

        puesto_trabajo,

        horas,

        cantidad_operacion,
        unidad_operacion,

        cantidad_notificada,
        unidad_notificada,

        cantidad_metros,
        unidad_metros,

        desperdicio,
        unidad_desperdicio,

        fuente,
        sociedad,
        procesado_en
      )
      VALUES (
        @eventId,

        @orden,
        @operador,
        @turno,

        @codigoMaterial,
        @pedido,
        @posicion,

        @nombreMaterial,

        @fechaReporte,
        @fechaReporteOriginal,

        @puestoTrabajo,

        @horas,

        @cantidadOperacion,
        @unidadOperacion,

        @cantidadNotificada,
        @unidadNotificada,

        @cantidadMetros,
        @unidadMetros,

        @desperdicio,
        @unidadDesperdicio,

        @fuente,
        @sociedad,
        @procesadoEn
      )
    `);

  let nuevos = 0;
  let existentes = 0;

  /*
   * Ejecutamos todos los inserts dentro
   * de una sola transacción.
   *
   * Esto es mucho más rápido que insertar
   * fila por fila con commits individuales.
   */
  const transaction =
    db.transaction(
      (
        registros:
          EventoProduccionProcesado[]
      ) => {
        for (
          const evento of registros
        ) {
          const resultado =
            insertStatement.run(
              evento
            );

          /*
           * INSERT OR IGNORE:
           *
           * changes === 1
           * → se insertó
           *
           * changes === 0
           * → event_id ya existía
           */
          if (
            resultado.changes === 1
          ) {
            nuevos++;
          } else {
            existentes++;
          }
        }
      }
    );

  transaction(eventos);

  return {
    nuevos,
    existentes,
  };
}

/* =========================================================
   CONTAR EVENTOS
========================================================= */

export function contarEventos(): number {
  /*
   * También preparamos el SELECT dentro
   * de la función para garantizar que la
   * tabla ya exista.
   */
  const statement =
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM events
    `);

  const row =
    statement.get() as {
      total: number;
    };

  return row.total;
}