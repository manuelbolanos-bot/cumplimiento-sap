import {
  db,
} from "./db.js";

import {
  logger,
} from "../utils/logger.js";

/* =========================================================
   TIPOS
========================================================= */

interface ResumenValidacionRow {
  /* =========================
     ULTIMA EJECUCION
  ========================= */

  ejecucion_id:
    | string
    | null;

  ejecucion_estado:
    | string
    | null;

  ejecucion_archivo:
    | string
    | null;

  ejecucion_fuente:
    | string
    | null;

  ejecucion_inicio:
    | string
    | null;

  ejecucion_fin:
    | string
    | null;

  ejecucion_solicitada_desde:
    | string
    | null;

  ejecucion_solicitada_hasta:
    | string
    | null;

  ejecucion_datos_desde:
    | string
    | null;

  ejecucion_datos_hasta:
    | string
    | null;

  ejecucion_filas_sap:
    | number
    | null;

  ejecucion_filas_procesadas:
    | number
    | null;

  ejecucion_filas_ignoradas:
    | number
    | null;

  ejecucion_mensaje:
    | string
    | null;

  ejecucion_alertas:
    | number
    | null;

  ejecucion_errores:
    | number
    | null;

  ejecucion_warnings:
    | number
    | null;

  ejecucion_periodos_invalidos:
    | number
    | null;

  /* =========================
     ULTIMA CARGA EXITOSA
  ========================= */

  exitosa_id:
    | string
    | null;

  exitosa_archivo:
    | string
    | null;

  exitosa_inicio:
    | string
    | null;

  exitosa_solicitada_desde:
    | string
    | null;

  exitosa_solicitada_hasta:
    | string
    | null;

  exitosa_datos_desde:
    | string
    | null;

  exitosa_datos_hasta:
    | string
    | null;

  exitosa_filas_sap:
    | number
    | null;

  exitosa_filas_procesadas:
    | number
    | null;

  exitosa_filas_ignoradas:
    | number
    | null;

  /* =========================
     ULTIMA CARGA COMPLETA
  ========================= */

  completa_id:
    | string
    | null;

  completa_archivo:
    | string
    | null;

  completa_inicio:
    | string
    | null;

  completa_solicitada_desde:
    | string
    | null;

  completa_solicitada_hasta:
    | string
    | null;

  completa_datos_desde:
    | string
    | null;

  completa_datos_hasta:
    | string
    | null;

  completa_filas_sap:
    | number
    | null;

  completa_filas_procesadas:
    | number
    | null;

  completa_filas_ignoradas:
    | number
    | null;

  /* =========================
     BI
  ========================= */

  registros_normalizados:
    | number
    | null;

  dias_con_datos:
    | number
    | null;

  maquinas:
    | number
    | null;

  secciones:
    | number
    | null;

  periodo_bi_desde:
    | string
    | null;

  periodo_bi_hasta:
    | string
    | null;

  filas_sap_utilizadas:
    | number
    | null;

  total_plan:
    | number
    | null;

  total_real:
    | number
    | null;

  total_diferencia:
    | number
    | null;

  total_desperdicio:
    | number
    | null;

  total_horas:
    | number
    | null;

  cumplimiento_global:
    | number
    | null;
}

/* =========================================================
   HELPERS
========================================================= */

function numero(
  valor: unknown
): number {
  return Number(
    valor ??
    0
  );
}

function formatoNumero(
  valor: unknown,
  decimales = 3
): string {
  return numero(
    valor
  ).toLocaleString(
    "en-US",
    {
      maximumFractionDigits:
        decimales,
    }
  );
}

function porcentaje(
  valor:
    | number
    | null
): string {
  if (
    valor === null ||
    valor === undefined
  ) {
    return "-";
  }

  return `${(
    valor *
    100
  ).toFixed(
    2
  )}%`;
}

/* =========================================================
   VALIDAR DEPENDENCIAS
========================================================= */

function validarDependencias():
void {
  const vista =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM
        sqlite_master

      WHERE
        type = 'view'

        AND name =
        'v_bdd_normalizada'
    `)
    .get() as {
      total: number;
    };

  if (
    vista.total !==
    1
  ) {
    throw new Error(
      "No existe v_bdd_normalizada. Ejecuta primero: npm run db:bdd-normalizada"
    );
  }

  const runs =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM
        import_runs
    `)
    .get() as {
      total: number;
    };

  if (
    runs.total ===
    0
  ) {
    throw new Error(
      "No existen registros en import_runs."
    );
  }
}

/* =========================================================
   CREAR VISTA
========================================================= */

function crearVista(): void {
  db.exec(`
    DROP VIEW IF EXISTS
      v_resumen_validacion;

    CREATE VIEW
      v_resumen_validacion
    AS

    /* =====================================================
       ULTIMA EJECUCION

       Puede ser OK o ERROR.
    ===================================================== */

    WITH ultima_ejecucion AS (
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

      FROM
        import_runs

      ORDER BY
        fecha_inicio DESC

      LIMIT 1
    ),

    /* =====================================================
       ALERTAS DE ULTIMA EJECUCION
    ===================================================== */

    alertas_ultima_ejecucion AS (
      SELECT
        COUNT(*) AS total_alertas,

        SUM(
          CASE
            WHEN nivel = 'ERROR'
            THEN 1
            ELSE 0
          END
        ) AS errores,

        SUM(
          CASE
            WHEN nivel = 'WARNING'
            THEN 1
            ELSE 0
          END
        ) AS warnings,

        SUM(
          CASE
            WHEN tipo_alerta =
              'PERIODO_INVALIDO'
            THEN 1
            ELSE 0
          END
        ) AS periodos_invalidos

      FROM
        import_alerts

      WHERE
        id_carga = (
          SELECT
            id_carga

          FROM
            ultima_ejecucion
        )
    ),

    /* =====================================================
       ULTIMA CARGA EXITOSA

       Última ejecución real con estado OK.
    ===================================================== */

    ultima_exitosa AS (
      SELECT
        id_carga,
        archivo_origen,

        fecha_inicio,

        fecha_solicitada_desde,
        fecha_solicitada_hasta,

        fecha_datos_desde,
        fecha_datos_hasta,

        filas_sap,
        filas_procesadas,
        filas_ignoradas

      FROM
        import_runs

      WHERE
        estado = 'OK'

        AND archivo_origen
          LIKE 'SAP_%'

      ORDER BY
        fecha_inicio DESC

      LIMIT 1
    ),

    /* =====================================================
       ULTIMA CARGA COMPLETA

       Definición operacional actual:

       - estado OK
       - archivo SAP real
       - rango solicitado de más de un día

       Esto permite distinguir una reimportación diaria
       de una extracción de rango.

       Actualmente debe encontrar, por ejemplo:
       2026-09-01 -> 2026-09-18
    ===================================================== */

    ultima_completa AS (
      SELECT
        id_carga,
        archivo_origen,

        fecha_inicio,

        fecha_solicitada_desde,
        fecha_solicitada_hasta,

        fecha_datos_desde,
        fecha_datos_hasta,

        filas_sap,
        filas_procesadas,
        filas_ignoradas

      FROM
        import_runs

      WHERE
        estado = 'OK'

        AND archivo_origen
          LIKE 'SAP_%'

        AND fecha_solicitada_desde
          IS NOT NULL

        AND fecha_solicitada_hasta
          IS NOT NULL

        AND julianday(
          fecha_solicitada_hasta
        ) >
        julianday(
          fecha_solicitada_desde
        )

      ORDER BY
        fecha_inicio DESC

      LIMIT 1
    ),

    /* =====================================================
       ESTADO ACTUAL BI
    ===================================================== */

    resumen_bi AS (
      SELECT
        COUNT(*) AS
          registros_normalizados,

        COUNT(
          DISTINCT fecha
        ) AS
          dias_con_datos,

        COUNT(
          DISTINCT maquina
        ) AS
          maquinas,

        COUNT(
          DISTINCT seccion
        ) AS
          secciones,

        MIN(
          fecha
        ) AS
          periodo_bi_desde,

        MAX(
          fecha
        ) AS
          periodo_bi_hasta,

        SUM(
          registros_sap
        ) AS
          filas_sap_utilizadas,

        SUM(
          plan
        ) AS
          total_plan,

        SUM(
          real
        ) AS
          total_real,

        SUM(
          diferencia
        ) AS
          total_diferencia,

        SUM(
          desperdicio
        ) AS
          total_desperdicio,

        SUM(
          horas
        ) AS
          total_horas,

        CASE
          WHEN SUM(
            plan
          ) <> 0

          THEN
            SUM(
              real
            )
            /
            SUM(
              plan
            )

          ELSE NULL
        END AS
          cumplimiento_global

      FROM
        v_bdd_normalizada
    )

    SELECT
      /* =========================
         ULTIMA EJECUCION
      ========================= */

      ue.id_carga
        AS ejecucion_id,

      ue.estado
        AS ejecucion_estado,

      ue.archivo_origen
        AS ejecucion_archivo,

      ue.fuente
        AS ejecucion_fuente,

      ue.fecha_inicio
        AS ejecucion_inicio,

      ue.fecha_fin
        AS ejecucion_fin,

      ue.fecha_solicitada_desde
        AS ejecucion_solicitada_desde,

      ue.fecha_solicitada_hasta
        AS ejecucion_solicitada_hasta,

      ue.fecha_datos_desde
        AS ejecucion_datos_desde,

      ue.fecha_datos_hasta
        AS ejecucion_datos_hasta,

      ue.filas_sap
        AS ejecucion_filas_sap,

      ue.filas_procesadas
        AS ejecucion_filas_procesadas,

      ue.filas_ignoradas
        AS ejecucion_filas_ignoradas,

      ue.mensaje
        AS ejecucion_mensaje,

      COALESCE(
        aue.total_alertas,
        0
      ) AS ejecucion_alertas,

      COALESCE(
        aue.errores,
        0
      ) AS ejecucion_errores,

      COALESCE(
        aue.warnings,
        0
      ) AS ejecucion_warnings,

      COALESCE(
        aue.periodos_invalidos,
        0
      ) AS ejecucion_periodos_invalidos,

      /* =========================
         ULTIMA EXITOSA
      ========================= */

      uex.id_carga
        AS exitosa_id,

      uex.archivo_origen
        AS exitosa_archivo,

      uex.fecha_inicio
        AS exitosa_inicio,

      uex.fecha_solicitada_desde
        AS exitosa_solicitada_desde,

      uex.fecha_solicitada_hasta
        AS exitosa_solicitada_hasta,

      uex.fecha_datos_desde
        AS exitosa_datos_desde,

      uex.fecha_datos_hasta
        AS exitosa_datos_hasta,

      uex.filas_sap
        AS exitosa_filas_sap,

      uex.filas_procesadas
        AS exitosa_filas_procesadas,

      uex.filas_ignoradas
        AS exitosa_filas_ignoradas,

      /* =========================
         ULTIMA COMPLETA
      ========================= */

      uc.id_carga
        AS completa_id,

      uc.archivo_origen
        AS completa_archivo,

      uc.fecha_inicio
        AS completa_inicio,

      uc.fecha_solicitada_desde
        AS completa_solicitada_desde,

      uc.fecha_solicitada_hasta
        AS completa_solicitada_hasta,

      uc.fecha_datos_desde
        AS completa_datos_desde,

      uc.fecha_datos_hasta
        AS completa_datos_hasta,

      uc.filas_sap
        AS completa_filas_sap,

      uc.filas_procesadas
        AS completa_filas_procesadas,

      uc.filas_ignoradas
        AS completa_filas_ignoradas,

      /* =========================
         BI
      ========================= */

      rb.registros_normalizados,

      rb.dias_con_datos,

      rb.maquinas,

      rb.secciones,

      rb.periodo_bi_desde,

      rb.periodo_bi_hasta,

      rb.filas_sap_utilizadas,

      rb.total_plan,

      rb.total_real,

      rb.total_diferencia,

      rb.total_desperdicio,

      rb.total_horas,

      rb.cumplimiento_global

    FROM
      ultima_ejecucion ue

    CROSS JOIN
      alertas_ultima_ejecucion aue

    LEFT JOIN
      ultima_exitosa uex
      ON 1 = 1

    LEFT JOIN
      ultima_completa uc
      ON 1 = 1

    CROSS JOIN
      resumen_bi rb;
  `);
}

/* =========================================================
   OBTENER RESUMEN
========================================================= */

function obtenerResumen():
ResumenValidacionRow {
  return db.prepare(`
    SELECT
      *

    FROM
      v_resumen_validacion
  `)
  .get() as ResumenValidacionRow;
}

/* =========================================================
   MOSTRAR ULTIMA EJECUCION
========================================================= */

function mostrarUltimaEjecucion(
  row:
    ResumenValidacionRow
): void {
  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "ULTIMA EJECUCION"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `ID carga:              ${row.ejecucion_id ?? "-"}`
  );

  console.log(
    `Estado:                ${row.ejecucion_estado ?? "-"}`
  );

  console.log(
    `Archivo:               ${row.ejecucion_archivo ?? "-"}`
  );

  console.log(
    `Fuente:                ${row.ejecucion_fuente ?? "-"}`
  );

  console.log(
    `Periodo solicitado:    ${row.ejecucion_solicitada_desde ?? "-"} -> ${row.ejecucion_solicitada_hasta ?? "-"}`
  );

  console.log(
    `Periodo encontrado:    ${row.ejecucion_datos_desde ?? "-"} -> ${row.ejecucion_datos_hasta ?? "-"}`
  );

  console.log(
    `Filas SAP:             ${row.ejecucion_filas_sap ?? 0}`
  );

  console.log(
    `Filas procesadas:      ${row.ejecucion_filas_procesadas ?? 0}`
  );

  console.log(
    `Filas ignoradas:       ${row.ejecucion_filas_ignoradas ?? 0}`
  );

  console.log(
    `Alertas:               ${row.ejecucion_alertas ?? 0}`
  );

  console.log(
    `Errores:               ${row.ejecucion_errores ?? 0}`
  );

  console.log(
    `Warnings:              ${row.ejecucion_warnings ?? 0}`
  );

  console.log(
    `Periodos invalidos:    ${row.ejecucion_periodos_invalidos ?? 0}`
  );

  console.log(
    `Mensaje:               ${row.ejecucion_mensaje ?? "-"}`
  );
}

/* =========================================================
   ULTIMA CARGA EXITOSA
========================================================= */

function mostrarUltimaExitosa(
  row:
    ResumenValidacionRow
): void {
  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "ULTIMA CARGA EXITOSA"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `ID carga:              ${row.exitosa_id ?? "-"}`
  );

  console.log(
    `Archivo:               ${row.exitosa_archivo ?? "-"}`
  );

  console.log(
    `Periodo solicitado:    ${row.exitosa_solicitada_desde ?? "-"} -> ${row.exitosa_solicitada_hasta ?? "-"}`
  );

  console.log(
    `Periodo encontrado:    ${row.exitosa_datos_desde ?? "-"} -> ${row.exitosa_datos_hasta ?? "-"}`
  );

  console.log(
    `Filas SAP:             ${row.exitosa_filas_sap ?? 0}`
  );

  console.log(
    `Filas procesadas:      ${row.exitosa_filas_procesadas ?? 0}`
  );

  console.log(
    `Filas ignoradas:       ${row.exitosa_filas_ignoradas ?? 0}`
  );
}

/* =========================================================
   ULTIMA CARGA COMPLETA
========================================================= */

function mostrarUltimaCompleta(
  row:
    ResumenValidacionRow
): void {
  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "ULTIMA CARGA COMPLETA / RANGO"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `ID carga:              ${row.completa_id ?? "-"}`
  );

  console.log(
    `Archivo:               ${row.completa_archivo ?? "-"}`
  );

  console.log(
    `Periodo solicitado:    ${row.completa_solicitada_desde ?? "-"} -> ${row.completa_solicitada_hasta ?? "-"}`
  );

  console.log(
    `Periodo encontrado:    ${row.completa_datos_desde ?? "-"} -> ${row.completa_datos_hasta ?? "-"}`
  );

  console.log(
    `Filas SAP:             ${row.completa_filas_sap ?? 0}`
  );

  console.log(
    `Filas procesadas:      ${row.completa_filas_procesadas ?? 0}`
  );

  console.log(
    `Filas ignoradas:       ${row.completa_filas_ignoradas ?? 0}`
  );
}

/* =========================================================
   ESTADO BI
========================================================= */

function mostrarEstadoBi(
  row:
    ResumenValidacionRow
): void {
  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "ESTADO ACTUAL BI"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `Registros normalizados: ${row.registros_normalizados ?? 0}`
  );

  console.log(
    `Dias con datos:         ${row.dias_con_datos ?? 0}`
  );

  console.log(
    `Maquinas:               ${row.maquinas ?? 0}`
  );

  console.log(
    `Secciones:              ${row.secciones ?? 0}`
  );

  console.log(
    `Periodo BI:             ${row.periodo_bi_desde ?? "-"} -> ${row.periodo_bi_hasta ?? "-"}`
  );

  console.log(
    `Filas SAP utilizadas:   ${row.filas_sap_utilizadas ?? 0}`
  );

  console.log(
    `Plan total:             ${formatoNumero(
      row.total_plan
    )}`
  );

  console.log(
    `Real total:             ${formatoNumero(
      row.total_real
    )}`
  );

  console.log(
    `Diferencia total:       ${formatoNumero(
      row.total_diferencia
    )}`
  );

  console.log(
    `Desperdicio total:      ${formatoNumero(
      row.total_desperdicio
    )}`
  );

  console.log(
    `Horas totales:          ${formatoNumero(
      row.total_horas,
      2
    )}`
  );

  console.log(
    `Cumplimiento global:    ${porcentaje(
      row.cumplimiento_global
    )}`
  );

  console.log(
    "=".repeat(
      100
    )
  );
}

/* =========================================================
   ALERTAS DE ULTIMA EJECUCION
========================================================= */

function mostrarAlertasUltimaEjecucion():
void {
  const row =
    db.prepare(`
      SELECT
        id_carga

      FROM
        import_runs

      ORDER BY
        fecha_inicio DESC

      LIMIT 1
    `)
    .get() as {
      id_carga: string;
    };

  const alertas =
    db.prepare(`
      SELECT
        nivel,
        tipo_alerta,
        puesto_sap,
        maquina,
        seccion,
        mensaje

      FROM
        import_alerts

      WHERE
        id_carga = ?

      ORDER BY
        CASE nivel
          WHEN 'ERROR'
          THEN 1

          WHEN 'WARNING'
          THEN 2

          ELSE 3
        END,

        tipo_alerta,

        puesto_sap
    `)
    .all(
      row.id_carga
    );

  console.log(
    "\nALERTAS DE ULTIMA EJECUCION"
  );

  if (
    alertas.length ===
    0
  ) {
    console.log(
      "Sin alertas."
    );

    return;
  }

  console.table(
    alertas
  );
}

/* =========================================================
   HISTORIAL
========================================================= */

function mostrarHistorial():
void {
  const historial =
    db.prepare(`
      SELECT
        id_carga,

        estado,

        archivo_origen,

        fecha_solicitada_desde,
        fecha_solicitada_hasta,

        fecha_datos_desde,
        fecha_datos_hasta,

        filas_sap,
        filas_procesadas,
        filas_ignoradas,

        fecha_inicio

      FROM
        import_runs

      ORDER BY
        fecha_inicio DESC

      LIMIT 10
    `)
    .all();

  console.log(
    "\nULTIMAS 10 EJECUCIONES"
  );

  console.table(
    historial
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
    "GENERANDO RESUMEN DE VALIDACION"
  );

  logger.info(
    "=================================="
  );

  validarDependencias();

  crearVista();

  const resumen =
    obtenerResumen();

  mostrarUltimaEjecucion(
    resumen
  );

  mostrarUltimaExitosa(
    resumen
  );

  mostrarUltimaCompleta(
    resumen
  );

  mostrarEstadoBi(
    resumen
  );

  mostrarAlertasUltimaEjecucion();

  mostrarHistorial();

  logger.info(
    "=================================="
  );

  logger.info(
    "RESUMEN DE VALIDACION DISPONIBLE"
  );

  logger.info(
    "=================================="
  );
}

main();