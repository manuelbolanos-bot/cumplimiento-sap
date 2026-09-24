import fs from "node:fs";
import path from "node:path";

import {
  logger,
} from "../utils/logger.js";

import {
  db,
} from "../database/db.js";

import {
  startImportRun,
  finishImportRun,
  createImportAlert,
} from "../database/import-control.js";

import {
  validatePeriod,
} from "./validate-period.js";

/* =========================================================
   TIPOS
========================================================= */

interface EventoProcesado {
  fechaReporte?: string;

  [key: string]:
    unknown;
}

/* =========================================================
   BUSCAR ULTIMO PROCESSED
========================================================= */

function buscarJsons(
  dir: string
): string[] {
  if (
    !fs.existsSync(
      dir
    )
  ) {
    return [];
  }

  const resultados:
    string[] = [];

  const entries =
    fs.readdirSync(
      dir,
      {
        withFileTypes:
          true,
      }
    );

  for (
    const entry of entries
  ) {
    const full =
      path.join(
        dir,
        entry.name
      );

    if (
      entry.isDirectory()
    ) {
      resultados.push(
        ...buscarJsons(
          full
        )
      );

      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith(
        ".processed.json"
      )
    ) {
      resultados.push(
        full
      );
    }
  }

  return resultados;
}

function encontrarUltimoProcessed():
string {
  const base =
    path.resolve(
      "data/processed"
    );

  const files =
    buscarJsons(
      base
    );

  if (
    files.length ===
    0
  ) {
    throw new Error(
      "No se encontraron archivos .processed.json en data/processed."
    );
  }

  files.sort(
    (a, b) =>
      fs.statSync(
        b
      ).mtimeMs -
      fs.statSync(
        a
      ).mtimeMs
  );

  return files[0];
}

/* =========================================================
   LEER PROCESSED
========================================================= */

function leerEventos(
  file: string
): EventoProcesado[] {
  const contenido =
    JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );

  if (
    Array.isArray(
      contenido
    )
  ) {
    return contenido;
  }

  if (
    Array.isArray(
      contenido.registros
    )
  ) {
    return contenido.registros;
  }

  if (
    Array.isArray(
      contenido.eventos
    )
  ) {
    return contenido.eventos;
  }

  if (
    Array.isArray(
      contenido.data
    )
  ) {
    return contenido.data;
  }

  throw new Error(
    "No se encontró un arreglo de eventos en el processed."
  );
}

/* =========================================================
   CONTAR EVENTS
========================================================= */

function contarEventos():
number {
  const row =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM
        events
    `)
    .get() as {
      total: number;
    };

  return Number(
    row.total
  );
}

/* =========================================================
   MAIN
========================================================= */

function main(): void {
  logger.info(
    "=================================="
  );

  logger.info(
    "PRUEBA CONTROLADA DE RECHAZO"
  );

  logger.info(
    "=================================="
  );

  const processedPath =
    encontrarUltimoProcessed();

  const archivoOrigen =
    path.basename(
      processedPath
    );

  const eventos =
    leerEventos(
      processedPath
    );

  const fechas =
    eventos.map(
      (evento) =>
        evento.fechaReporte
    );

  /*
   * Forzamos octubre.
   *
   * El processed actual contiene
   * septiembre, así que debe fallar.
   */
  const desde =
    "2026-10-01";

  const hasta =
    "2026-10-31";

  const totalAntes =
    contarEventos();

  const idCarga =
    startImportRun({
      archivoOrigen,

      fechaSolicitadaDesde:
        desde,

      fechaSolicitadaHasta:
        hasta,

      fuente:
        "SAP_PRINCIPAL",
    });

  const validacion =
    validatePeriod({
      fechas,
      desde,
      hasta,
    });

  if (
    validacion.valido
  ) {
    finishImportRun({
      idCarga,

      estado:
        "ERROR",

      filasSap:
        eventos.length,

      filasProcesadas:
        0,

      filasIgnoradas:
        eventos.length,

      fechaDatosDesde:
        validacion
          .fechaMinima,

      fechaDatosHasta:
        validacion
          .fechaMaxima,

      mensaje:
        "La prueba esperaba rechazo, pero el periodo fue aceptado.",
    });

    throw new Error(
      "La prueba controlada falló: el periodo incorrecto fue aceptado."
    );
  }

  const mensaje =
    `Carga rechazada por periodo. ${validacion.mensaje}`;

  createImportAlert({
    idCarga,

    archivoOrigen,

    nivel:
      "ERROR",

    tipo:
      "PERIODO_INVALIDO",

    mensaje,
  });

  finishImportRun({
    idCarga,

    estado:
      "ERROR",

    filasSap:
      eventos.length,

    filasProcesadas:
      0,

    filasIgnoradas:
      eventos.length,

    fechaDatosDesde:
      validacion
        .fechaMinima,

    fechaDatosHasta:
      validacion
        .fechaMaxima,

    mensaje,
  });

  const totalDespues =
    contarEventos();

  const run =
    db.prepare(`
      SELECT
        id_carga,
        estado,

        fecha_solicitada_desde,
        fecha_solicitada_hasta,

        fecha_datos_desde,
        fecha_datos_hasta,

        filas_sap,
        filas_procesadas,
        filas_ignoradas,

        mensaje

      FROM
        import_runs

      WHERE
        id_carga = ?
    `)
    .get(
      idCarga
    );

  const alerts =
    db.prepare(`
      SELECT
        nivel,
        tipo_alerta,
        mensaje

      FROM
        import_alerts

      WHERE
        id_carga = ?
    `)
    .all(
      idCarga
    );

  console.log(
    "\nPRUEBA CONTROLADA"
  );

  console.log(
    "-".repeat(
      90
    )
  );

  console.log(
    `Archivo:              ${archivoOrigen}`
  );

  console.log(
    `Periodo solicitado:   ${desde} -> ${hasta}`
  );

  console.log(
    `Periodo encontrado:   ${validacion.fechaMinima ?? "-"} -> ${validacion.fechaMaxima ?? "-"}`
  );

  console.log(
    `Valido:               ${validacion.valido ? "SI" : "NO"}`
  );

  console.log(
    `Eventos antes:        ${totalAntes}`
  );

  console.log(
    `Eventos despues:      ${totalDespues}`
  );

  console.log(
    `Base modificada:      ${totalAntes === totalDespues ? "NO" : "SI"}`
  );

  console.log(
    "-".repeat(
      90
    )
  );

  console.log(
    "\nIMPORT_RUN"
  );

  console.table(
    [
      run
    ]
  );

  console.log(
    "\nALERTAS"
  );

  console.table(
    alerts
  );

  if (
    totalAntes !==
    totalDespues
  ) {
    throw new Error(
      "La prueba falló: la cantidad de eventos cambió durante un rechazo."
    );
  }

  logger.info(
    {
      idCarga,

      eventosAntes:
        totalAntes,

      eventosDespues:
        totalDespues,

      estadoEsperado:
        "ERROR",
    },
    "Prueba controlada completada correctamente"
  );

  logger.info(
    "=================================="
  );

  logger.info(
    "RECHAZO VALIDADO SIN MODIFICAR EVENTS"
  );

  logger.info(
    "=================================="
  );
}

main();