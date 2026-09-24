import { db } from "./db.js";
import { logger } from "../utils/logger.js";

interface ResumenMaquina {
  puesto_sap: string;
  maquina: string;
  proceso: string;

  operaciones: number;

  plan_unico: number;
  real_metros: number;

  diferencia: number;
  cumplimiento: number | null;
}

interface DetalleOperacion {
  puesto_sap: string;
  maquina: string;
  proceso: string;

  orden: string;
  posicion: number | null;
  codigo_material: string;
  nombre_material: string;

  plan: number;
  real: number;

  diferencia: number;
  cumplimiento: number | null;

  fecha_desde: string;
  fecha_hasta: string;

  eventos: number;
}

/* =========================================================
   FORMATO
========================================================= */

function numero(
  valor: number | null | undefined
): string {
  if (
    valor === null ||
    valor === undefined
  ) {
    return "-";
  }

  return Number(valor)
    .toLocaleString(
      "en-US",
      {
        maximumFractionDigits: 3,
      }
    );
}

function porcentaje(
  valor: number | null
): string {
  if (
    valor === null ||
    !Number.isFinite(valor)
  ) {
    return "-";
  }

  return `${valor.toFixed(2)}%`;
}

/* =========================================================
   RESUMEN POR MÁQUINA

   REGLA DE PRUEBA:

   PLAN:
   cantidad_operacion una sola vez por:
   puesto + orden + posicion + material

   REAL:
   SUM(cantidad_metros) de todos los eventos
   pertenecientes a esa operación.
========================================================= */

function obtenerResumen():
ResumenMaquina[] {
  const sql = `
    WITH operaciones AS (
      SELECT
        e.puesto_trabajo AS puesto_sap,
        mm.maquina,
        mm.proceso,

        e.orden,
        e.posicion,
        e.codigo_material,

        MAX(
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
        ) AS real

      FROM events e

      INNER JOIN machine_mapping mm
        ON mm.puesto_sap = e.puesto_trabajo

      WHERE
        mm.puesto_sap IN (
          '410P',
          '424P',
          '429P',
          '430P',
          '444P',
          '446P',
          '447SB',
          '447SL',
          '431P',
          '465P'
        )

      GROUP BY
        e.puesto_trabajo,
        mm.maquina,
        mm.proceso,
        e.orden,
        e.posicion,
        e.codigo_material
    )

    SELECT
      puesto_sap,
      maquina,
      proceso,

      COUNT(*) AS operaciones,

      SUM(plan) AS plan_unico,

      SUM(real) AS real_metros,

      SUM(real) - SUM(plan) AS diferencia,

      CASE
        WHEN SUM(plan) > 0
        THEN (
          SUM(real) /
          SUM(plan)
        ) * 100
        ELSE NULL
      END AS cumplimiento

    FROM operaciones

    GROUP BY
      puesto_sap,
      maquina,
      proceso

    ORDER BY
      proceso,
      maquina,
      puesto_sap
  `;

  return db
    .prepare(sql)
    .all() as ResumenMaquina[];
}

/* =========================================================
   DETALLE POR OPERACIÓN
========================================================= */

function obtenerDetalle(
  puestoSap: string,
  limite = 8
): DetalleOperacion[] {
  const sql = `
    SELECT
      e.puesto_trabajo AS puesto_sap,
      mm.maquina,
      mm.proceso,

      e.orden,
      e.posicion,
      e.codigo_material,

      MAX(
        e.nombre_material
      ) AS nombre_material,

      MAX(
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
      ) AS real,

      SUM(
        COALESCE(
          e.cantidad_metros,
          0
        )
      ) -
      MAX(
        COALESCE(
          e.cantidad_operacion,
          0
        )
      ) AS diferencia,

      CASE
        WHEN MAX(
          COALESCE(
            e.cantidad_operacion,
            0
          )
        ) > 0

        THEN (
          SUM(
            COALESCE(
              e.cantidad_metros,
              0
            )
          )
          /
          MAX(
            COALESCE(
              e.cantidad_operacion,
              0
            )
          )
        ) * 100

        ELSE NULL
      END AS cumplimiento,

      MIN(
        e.fecha_reporte
      ) AS fecha_desde,

      MAX(
        e.fecha_reporte
      ) AS fecha_hasta,

      COUNT(*) AS eventos

    FROM events e

    INNER JOIN machine_mapping mm
      ON mm.puesto_sap = e.puesto_trabajo

    WHERE
      e.puesto_trabajo = ?

    GROUP BY
      e.puesto_trabajo,
      mm.maquina,
      mm.proceso,
      e.orden,
      e.posicion,
      e.codigo_material

    ORDER BY
      MAX(
        e.fecha_reporte
      ) DESC,
      e.orden DESC

    LIMIT ?
  `;

  return db
    .prepare(sql)
    .all(
      puestoSap,
      limite
    ) as DetalleOperacion[];
}

/* =========================================================
   MOSTRAR RESUMEN
========================================================= */

function mostrarResumen(
  resumen: ResumenMaquina[]
): void {
  console.log(
    "\n" +
    "=".repeat(118)
  );

  console.log(
    "VALIDACION DE CUMPLIMIENTO CANDIDATO"
  );

  console.log(
    "=".repeat(118)
  );

  console.log(
    [
      "PUESTO".padEnd(9),
      "MAQ".padEnd(7),
      "PROCESO".padEnd(15),
      "OPS".padStart(6),
      "PLAN".padStart(18),
      "REAL M".padStart(18),
      "DIF".padStart(18),
      "CUMP".padStart(10),
    ].join(
      " | "
    )
  );

  console.log(
    "-".repeat(118)
  );

  for (
    const row of resumen
  ) {
    console.log(
      [
        row.puesto_sap
          .padEnd(9),

        row.maquina
          .padEnd(7),

        row.proceso
          .padEnd(15),

        String(
          row.operaciones
        )
          .padStart(6),

        numero(
          row.plan_unico
        )
          .padStart(18),

        numero(
          row.real_metros
        )
          .padStart(18),

        numero(
          row.diferencia
        )
          .padStart(18),

        porcentaje(
          row.cumplimiento
        )
          .padStart(10),
      ].join(
        " | "
      )
    );
  }

  console.log(
    "=".repeat(118)
  );
}

/* =========================================================
   MOSTRAR DETALLE
========================================================= */

function mostrarDetalle(
  resumen: ResumenMaquina[]
): void {
  for (
    const maquina of resumen
  ) {
    const detalles =
      obtenerDetalle(
        maquina.puesto_sap,
        6
      );

    console.log(
      "\n" +
      "#".repeat(90)
    );

    console.log(
      `PUESTO ${maquina.puesto_sap} -> MAQUINA ${maquina.maquina} | ${maquina.proceso}`
    );

    console.log(
      "#".repeat(90)
    );

    for (
      const detalle of detalles
    ) {
      console.log(
        "-".repeat(90)
      );

      console.log(
        `Orden:      ${detalle.orden}`
      );

      console.log(
        `Posicion:   ${detalle.posicion ?? ""}`
      );

      console.log(
        `Material:   ${detalle.codigo_material} - ${detalle.nombre_material}`
      );

      console.log(
        `Periodo:    ${detalle.fecha_desde} -> ${detalle.fecha_hasta}`
      );

      console.log(
        `Eventos:    ${detalle.eventos}`
      );

      console.log(
        `Plan:       ${numero(detalle.plan)} M`
      );

      console.log(
        `Real:       ${numero(detalle.real)} M`
      );

      console.log(
        `Diferencia: ${numero(detalle.diferencia)} M`
      );

      console.log(
        `Cumpl.:     ${porcentaje(detalle.cumplimiento)}`
      );
    }
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
    "VALIDACION CUMPLIMIENTO CANDIDATO"
  );

  logger.info(
    "=================================="
  );

  const resumen =
    obtenerResumen();

  if (
    resumen.length === 0
  ) {
    throw new Error(
      "No se encontraron máquinas candidatas para validar."
    );
  }

  mostrarResumen(
    resumen
  );

  mostrarDetalle(
    resumen
  );

  logger.info(
    {
      puestos:
        resumen.length,
    },
    "Validación completada"
  );

  logger.info(
    "=================================="
  );

  logger.info(
    "FIN VALIDACION"
  );

  logger.info(
    "=================================="
  );
}

main();