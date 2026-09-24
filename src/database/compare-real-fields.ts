import { db } from "./db.js";
import { logger } from "../utils/logger.js";

interface ComparacionDiaria {
  fecha: string;
  seccion: string;
  maquina: string;

  plan: number;

  real_metros: number;
  real_notificada: number;

  cumplimiento_metros: number | null;
  cumplimiento_notificada: number | null;

  filas: number;
  ordenes: number;

  puestos_sap: string;
}

interface ComparacionMaquina {
  seccion: string;
  maquina: string;

  dias: number;
  filas: number;
  ordenes: number;

  plan: number;

  real_metros: number;
  real_notificada: number;

  cumplimiento_metros: number | null;
  cumplimiento_notificada: number | null;

  unidad_plan: string;
  unidad_notificada: string;
  unidad_metros: string;
}

/* =========================================================
   UTILIDADES
========================================================= */

function numero(
  value: number | null | undefined,
  decimals = 3
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "-";
  }

  return Number(value).toLocaleString(
    "en-US",
    {
      maximumFractionDigits: decimals,
    }
  );
}

function porcentaje(
  value: number | null | undefined
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "-";
  }

  return `${(
    Number(value) * 100
  ).toFixed(2)}%`;
}

/* =========================================================
   VISTA COMPARATIVA

   Importante:
   - respeta activo = 1
   - excluye 10249848
   - suma fila por fila
   - agrupa por fecha + maquina + seccion
========================================================= */

function crearVista(): void {
  db.exec(`
    DROP VIEW IF EXISTS
      v_compare_real_fields;

    CREATE VIEW
      v_compare_real_fields
    AS

    SELECT
      e.fecha_reporte AS fecha,

      mm.proceso AS seccion,
      mm.maquina AS maquina,

      SUM(
        COALESCE(
          e.cantidad_operacion,
          0
        )
      ) AS plan,

      SUM(
        COALESCE(
          e.cantidad_metros,
          0
        )
      ) AS real_metros,

      SUM(
        COALESCE(
          e.cantidad_notificada,
          0
        )
      ) AS real_notificada,

      CASE
        WHEN SUM(
          COALESCE(
            e.cantidad_operacion,
            0
          )
        ) <> 0

        THEN
          SUM(
            COALESCE(
              e.cantidad_metros,
              0
            )
          )
          /
          SUM(
            COALESCE(
              e.cantidad_operacion,
              0
            )
          )

        ELSE NULL
      END AS cumplimiento_metros,

      CASE
        WHEN SUM(
          COALESCE(
            e.cantidad_operacion,
            0
          )
        ) <> 0

        THEN
          SUM(
            COALESCE(
              e.cantidad_notificada,
              0
            )
          )
          /
          SUM(
            COALESCE(
              e.cantidad_operacion,
              0
            )
          )

        ELSE NULL
      END AS cumplimiento_notificada,

      COUNT(*) AS filas,

      COUNT(
        DISTINCT e.orden
      ) AS ordenes,

      GROUP_CONCAT(
        DISTINCT e.puesto_trabajo
      ) AS puestos_sap

    FROM events e

    INNER JOIN machine_mapping mm
      ON mm.puesto_sap =
         e.puesto_trabajo

      AND mm.activo = 1

    WHERE
      e.codigo_material <>
      '10249848'

    GROUP BY
      e.fecha_reporte,
      mm.proceso,
      mm.maquina;
  `);
}

/* =========================================================
   RESUMEN POR MAQUINA
========================================================= */

function obtenerResumenMaquina():
ComparacionMaquina[] {
  const sql = `
    SELECT
      mm.proceso AS seccion,
      mm.maquina AS maquina,

      COUNT(
        DISTINCT e.fecha_reporte
      ) AS dias,

      COUNT(*) AS filas,

      COUNT(
        DISTINCT e.orden
      ) AS ordenes,

      SUM(
        COALESCE(
          e.cantidad_operacion,
          0
        )
      ) AS plan,

      SUM(
        COALESCE(
          e.cantidad_metros,
          0
        )
      ) AS real_metros,

      SUM(
        COALESCE(
          e.cantidad_notificada,
          0
        )
      ) AS real_notificada,

      CASE
        WHEN SUM(
          COALESCE(
            e.cantidad_operacion,
            0
          )
        ) <> 0

        THEN
          SUM(
            COALESCE(
              e.cantidad_metros,
              0
            )
          )
          /
          SUM(
            COALESCE(
              e.cantidad_operacion,
              0
            )
          )

        ELSE NULL
      END AS cumplimiento_metros,

      CASE
        WHEN SUM(
          COALESCE(
            e.cantidad_operacion,
            0
          )
        ) <> 0

        THEN
          SUM(
            COALESCE(
              e.cantidad_notificada,
              0
            )
          )
          /
          SUM(
            COALESCE(
              e.cantidad_operacion,
              0
            )
          )

        ELSE NULL
      END AS cumplimiento_notificada,

      MAX(
        COALESCE(
          e.unidad_operacion,
          ''
        )
      ) AS unidad_plan,

      MAX(
        COALESCE(
          e.unidad_notificada,
          ''
        )
      ) AS unidad_notificada,

      MAX(
        COALESCE(
          e.unidad_metros,
          ''
        )
      ) AS unidad_metros

    FROM events e

    INNER JOIN machine_mapping mm
      ON mm.puesto_sap =
         e.puesto_trabajo

      AND mm.activo = 1

    WHERE
      e.codigo_material <>
      '10249848'

    GROUP BY
      mm.proceso,
      mm.maquina

    ORDER BY
      mm.proceso,
      mm.maquina
  `;

  return db
    .prepare(sql)
    .all() as ComparacionMaquina[];
}

/* =========================================================
   DETALLE DIARIO
========================================================= */

function obtenerDetalleDiario():
ComparacionDiaria[] {
  return db
    .prepare(`
      SELECT
        fecha,
        seccion,
        maquina,

        plan,

        real_metros,
        real_notificada,

        cumplimiento_metros,
        cumplimiento_notificada,

        filas,
        ordenes,

        puestos_sap

      FROM
        v_compare_real_fields

      ORDER BY
        fecha DESC,
        seccion,
        maquina
    `)
    .all() as ComparacionDiaria[];
}

/* =========================================================
   MOSTRAR RESUMEN
========================================================= */

function mostrarResumen(
  rows: ComparacionMaquina[]
): void {
  console.log(
    "\n" +
    "=".repeat(175)
  );

  console.log(
    "COMPARACION DE CAMPOS REAL POR MAQUINA"
  );

  console.log(
    "=".repeat(175)
  );

  console.log(
    [
      "SECCION".padEnd(15),
      "MAQ".padEnd(7),

      "DIAS".padStart(5),
      "FILAS".padStart(7),
      "ORD".padStart(6),

      "PLAN".padStart(18),

      "METROS".padStart(18),
      "CUMP M".padStart(10),

      "NOTIF".padStart(18),
      "CUMP N".padStart(10),

      "U.PLAN".padEnd(8),
      "U.MET".padEnd(8),
      "U.NOT".padEnd(8),
    ].join(" | ")
  );

  console.log(
    "-".repeat(175)
  );

  for (const row of rows) {
    console.log(
      [
        row.seccion.padEnd(15),
        row.maquina.padEnd(7),

        String(
          row.dias
        ).padStart(5),

        String(
          row.filas
        ).padStart(7),

        String(
          row.ordenes
        ).padStart(6),

        numero(
          row.plan
        ).padStart(18),

        numero(
          row.real_metros
        ).padStart(18),

        porcentaje(
          row.cumplimiento_metros
        ).padStart(10),

        numero(
          row.real_notificada
        ).padStart(18),

        porcentaje(
          row.cumplimiento_notificada
        ).padStart(10),

        (
          row.unidad_plan || "-"
        ).padEnd(8),

        (
          row.unidad_metros || "-"
        ).padEnd(8),

        (
          row.unidad_notificada || "-"
        ).padEnd(8),
      ].join(" | ")
    );
  }

  console.log(
    "=".repeat(175)
  );
}

/* =========================================================
   MOSTRAR DETALLE DIARIO
========================================================= */

function mostrarDetalle(
  rows: ComparacionDiaria[]
): void {
  console.log(
    "\nDETALLE DIARIO"
  );

  console.log(
    "-".repeat(155)
  );

  console.log(
    [
      "FECHA".padEnd(12),
      "SECCION".padEnd(14),
      "MAQ".padEnd(6),

      "PLAN".padStart(16),

      "METROS".padStart(16),
      "CUMP M".padStart(10),

      "NOTIF".padStart(16),
      "CUMP N".padStart(10),

      "FILAS".padStart(7),
      "ORD".padStart(5),

      "PUESTOS",
    ].join(" | ")
  );

  console.log(
    "-".repeat(155)
  );

  for (const row of rows) {
    console.log(
      [
        row.fecha.padEnd(12),
        row.seccion.padEnd(14),
        row.maquina.padEnd(6),

        numero(
          row.plan
        ).padStart(16),

        numero(
          row.real_metros
        ).padStart(16),

        porcentaje(
          row.cumplimiento_metros
        ).padStart(10),

        numero(
          row.real_notificada
        ).padStart(16),

        porcentaje(
          row.cumplimiento_notificada
        ).padStart(10),

        String(
          row.filas
        ).padStart(7),

        String(
          row.ordenes
        ).padStart(5),

        row.puestos_sap,
      ].join(" | ")
    );
  }

  console.log(
    "-".repeat(155)
  );
}

/* =========================================================
   ALERTAS DE UNIDADES
========================================================= */

function mostrarAdvertencias(
  rows: ComparacionMaquina[]
): void {
  console.log(
    "\nOBSERVACIONES DE UNIDADES"
  );

  console.log(
    "-".repeat(90)
  );

  for (const row of rows) {
    console.log(
      `${row.seccion} / ${row.maquina}`
    );

    console.log(
      `  Plan:       ${row.unidad_plan || "-"}`
    );

    console.log(
      `  Metros:     ${row.unidad_metros || "-"}`
    );

    console.log(
      `  Notificada: ${row.unidad_notificada || "-"}`
    );

    if (
      row.unidad_plan &&
      row.unidad_metros &&
      row.unidad_plan !==
        row.unidad_metros
    ) {
      console.log(
        "  ADVERTENCIA: Plan y Cantidad en Metros usan unidades distintas."
      );
    }

    if (
      row.unidad_plan &&
      row.unidad_notificada &&
      row.unidad_plan !==
        row.unidad_notificada
    ) {
      console.log(
        "  INFO: Cantidad Notificada no es dimensionalmente comparable directamente con Plan."
      );
    }

    console.log("");
  }
}

/* =========================================================
   MAIN
========================================================= */

function main(): void {
  logger.info(
    "=================================="
  );

  logger.info(
    "COMPARANDO CAMPOS REAL"
  );

  logger.info(
    "=================================="
  );

  crearVista();

  const resumen =
    obtenerResumenMaquina();

  const detalle =
    obtenerDetalleDiario();

  mostrarResumen(
    resumen
  );

  mostrarAdvertencias(
    resumen
  );

  mostrarDetalle(
    detalle
  );

  logger.info(
    {
      maquinas:
        resumen.length,

      registrosDiarios:
        detalle.length,
    },
    "Comparacion de campos completada"
  );

  logger.info(
    "=================================="
  );

  logger.info(
    "FIN COMPARACION CAMPOS REAL"
  );

  logger.info(
    "=================================="
  );
}

main();