import { db } from "./db.js";
import { logger } from "../utils/logger.js";

import {
  ensureImportControlSchema,
  startImportRun,
  createImportAlert,
  finishImportRun,
} from "./import-control.js";

/* =========================================================
   PRUEBA CONTROLADA

   Se crea una carga de prueba y una alerta.
   Después se deja registrada como OK.

   Esto comprueba:
   - schema
   - PK
   - FK
   - escritura
   - lectura
========================================================= */

function main(): void {
  logger.info(
    "=================================="
  );

  logger.info(
    "CONFIGURANDO CONTROL DE CARGAS"
  );

  logger.info(
    "=================================="
  );

  ensureImportControlSchema();

  const idCarga =
    startImportRun({
      archivoOrigen:
        "PRUEBA_CONTROL_IMPORTACIONES.xlsx",

      fechaSolicitadaDesde:
        "2026-09-01",

      fechaSolicitadaHasta:
        "2026-09-30",
    });

  createImportAlert({
    idCarga,

    archivoOrigen:
      "PRUEBA_CONTROL_IMPORTACIONES.xlsx",

    nivel:
      "INFO",

    tipo:
      "VALIDACION_OK",

    mensaje:
      "Registro de prueba del sistema de trazabilidad.",
  });

  finishImportRun({
    idCarga,

    estado:
      "OK",

    filasSap:
      10,

    filasProcesadas:
      8,

    filasIgnoradas:
      2,

    fechaDatosDesde:
      "2026-09-01",

    fechaDatosHasta:
      "2026-09-18",

    mensaje:
      "Prueba de trazabilidad completada correctamente.",
  });

  const run =
    db.prepare(`
      SELECT
        id_carga,
        fuente,
        archivo_origen,
        estado,

        fecha_inicio,
        fecha_fin,

        fecha_solicitada_desde,
        fecha_solicitada_hasta,

        fecha_datos_desde,
        fecha_datos_hasta,

        filas_sap,
        filas_procesadas,
        filas_ignoradas,

        mensaje

      FROM import_runs

      WHERE
        id_carga = ?
    `).get(
      idCarga
    );

  const alerts =
    db.prepare(`
      SELECT
        nivel,
        tipo_alerta,
        mensaje

      FROM import_alerts

      WHERE
        id_carga = ?

      ORDER BY
        fecha_alerta
    `).all(
      idCarga
    );

  console.log(
    "\nCONTROL DE IMPORTACION"
  );

  console.log(
    "-".repeat(80)
  );

  console.log(run);

  console.log(
    "\nALERTAS"
  );

  console.log(
    "-".repeat(80)
  );

  console.table(
    alerts
  );

  const tablas =
    db.prepare(`
      SELECT
        name

      FROM sqlite_master

      WHERE
        type = 'table'

        AND name IN (
          'import_runs',
          'import_alerts'
        )

      ORDER BY
        name
    `).all();

  console.log(
    "\nTABLAS"
  );

  console.log(
    "-".repeat(80)
  );

  console.table(
    tablas
  );

  logger.info(
    {
      idCarga,
    },
    "Control de cargas configurado correctamente"
  );

  logger.info(
    "=================================="
  );

  logger.info(
    "CONTROL DE CARGAS COMPLETADO"
  );

  logger.info(
    "=================================="
  );
}

main();