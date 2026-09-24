import { db } from "./db.js";
import { logger } from "../utils/logger.js";

/* =========================================================
   TIPOS
========================================================= */

interface ResumenPuesto {
  puesto_sap: string;
  maquina: string;

  eventos: number;
  operaciones: number;

  plan_total: number;
  notificada_total: number;
  metros_total: number;
  horas_total: number;
  desperdicio_total: number;

  eventos_con_notificada: number;
  eventos_con_metros: number;
  eventos_con_horas: number;
  eventos_con_desperdicio: number;
}

interface OperacionBolsera {
  puesto_sap: string;
  maquina: string;

  orden: string;
  posicion: number | null;

  codigo_material: string;
  nombre_material: string;

  fecha_desde: string;
  fecha_hasta: string;

  eventos: number;

  plan: number;
  notificada: number;
  metros: number;

  horas: number;
  desperdicio: number;

  unidad_plan: string;
  unidad_notificada: string;
  unidad_metros: string;
  unidad_desperdicio: string;

  operadores: string;
  turnos: string;
}

interface EventoBolsera {
  event_id: string;

  fecha_reporte: string;

  puesto_sap: string;
  maquina: string;

  orden: string;
  posicion: number | null;

  codigo_material: string;
  nombre_material: string;

  operador: string;
  turno: number | null;

  cantidad_operacion: number;
  unidad_operacion: string;

  cantidad_notificada: number;
  unidad_notificada: string;

  cantidad_metros: number;
  unidad_metros: string;

  horas: number;

  desperdicio: number;
  unidad_desperdicio: string;
}

/* =========================================================
   UTILIDADES
========================================================= */

function numero(
  valor: number | null | undefined,
  decimals = 3
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
        maximumFractionDigits:
          decimals,
      }
    );
}

function porcentaje(
  parte: number,
  total: number
): string {
  if (
    !total ||
    total <= 0
  ) {
    return "0.0%";
  }

  return `${
    (
      (
        parte /
        total
      ) *
      100
    ).toFixed(1)
  }%`;
}

/* =========================================================
   RESUMEN GENERAL
========================================================= */

function obtenerResumen():
ResumenPuesto[] {
  const sql = `
    WITH operaciones AS (
      SELECT
        e.puesto_trabajo AS puesto_sap,
        mm.maquina,

        e.orden,
        e.posicion,
        e.codigo_material,

        MAX(
          COALESCE(
            e.cantidad_operacion,
            0
          )
        ) AS plan

      FROM events e

      INNER JOIN machine_mapping mm
        ON mm.puesto_sap =
           e.puesto_trabajo

      WHERE
        e.puesto_trabajo IN (
          '476P',
          '478P'
        )

      GROUP BY
        e.puesto_trabajo,
        mm.maquina,
        e.orden,
        e.posicion,
        e.codigo_material
    ),

    eventos AS (
      SELECT
        e.puesto_trabajo AS puesto_sap,
        mm.maquina,

        COUNT(*) AS eventos,

        SUM(
          COALESCE(
            e.cantidad_notificada,
            0
          )
        ) AS notificada_total,

        SUM(
          COALESCE(
            e.cantidad_metros,
            0
          )
        ) AS metros_total,

        SUM(
          COALESCE(
            e.horas,
            0
          )
        ) AS horas_total,

        SUM(
          COALESCE(
            e.desperdicio,
            0
          )
        ) AS desperdicio_total,

        SUM(
          CASE
            WHEN COALESCE(
              e.cantidad_notificada,
              0
            ) > 0

            THEN 1
            ELSE 0
          END
        ) AS eventos_con_notificada,

        SUM(
          CASE
            WHEN COALESCE(
              e.cantidad_metros,
              0
            ) > 0

            THEN 1
            ELSE 0
          END
        ) AS eventos_con_metros,

        SUM(
          CASE
            WHEN COALESCE(
              e.horas,
              0
            ) > 0

            THEN 1
            ELSE 0
          END
        ) AS eventos_con_horas,

        SUM(
          CASE
            WHEN COALESCE(
              e.desperdicio,
              0
            ) > 0

            THEN 1
            ELSE 0
          END
        ) AS eventos_con_desperdicio

      FROM events e

      INNER JOIN machine_mapping mm
        ON mm.puesto_sap =
           e.puesto_trabajo

      WHERE
        e.puesto_trabajo IN (
          '476P',
          '478P'
        )

      GROUP BY
        e.puesto_trabajo,
        mm.maquina
    ),

    planes AS (
      SELECT
        puesto_sap,
        maquina,

        COUNT(*) AS operaciones,

        SUM(
          plan
        ) AS plan_total

      FROM operaciones

      GROUP BY
        puesto_sap,
        maquina
    )

    SELECT
      e.puesto_sap,
      e.maquina,

      e.eventos,
      p.operaciones,

      p.plan_total,

      e.notificada_total,
      e.metros_total,
      e.horas_total,
      e.desperdicio_total,

      e.eventos_con_notificada,
      e.eventos_con_metros,
      e.eventos_con_horas,
      e.eventos_con_desperdicio

    FROM eventos e

    INNER JOIN planes p
      ON p.puesto_sap =
         e.puesto_sap

    ORDER BY
      e.maquina
  `;

  return db
    .prepare(sql)
    .all() as ResumenPuesto[];
}

/* =========================================================
   OPERACIONES BOLSERA
========================================================= */

function obtenerOperaciones():
OperacionBolsera[] {
  const sql = `
    SELECT
      e.puesto_trabajo AS puesto_sap,
      mm.maquina,

      e.orden,
      e.posicion,

      e.codigo_material,

      MAX(
        e.nombre_material
      ) AS nombre_material,

      MIN(
        e.fecha_reporte
      ) AS fecha_desde,

      MAX(
        e.fecha_reporte
      ) AS fecha_hasta,

      COUNT(*) AS eventos,

      MAX(
        COALESCE(
          e.cantidad_operacion,
          0
        )
      ) AS plan,

      SUM(
        COALESCE(
          e.cantidad_notificada,
          0
        )
      ) AS notificada,

      SUM(
        COALESCE(
          e.cantidad_metros,
          0
        )
      ) AS metros,

      SUM(
        COALESCE(
          e.horas,
          0
        )
      ) AS horas,

      SUM(
        COALESCE(
          e.desperdicio,
          0
        )
      ) AS desperdicio,

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
      ) AS unidad_metros,

      MAX(
        COALESCE(
          e.unidad_desperdicio,
          ''
        )
      ) AS unidad_desperdicio,

      GROUP_CONCAT(
        DISTINCT NULLIF(
          TRIM(
            e.operador
          ),
          ''
        )
      ) AS operadores,

      GROUP_CONCAT(
        DISTINCT e.turno
      ) AS turnos

    FROM events e

    INNER JOIN machine_mapping mm
      ON mm.puesto_sap =
         e.puesto_trabajo

    WHERE
      e.puesto_trabajo IN (
        '476P',
        '478P'
      )

    GROUP BY
      e.puesto_trabajo,
      mm.maquina,
      e.orden,
      e.posicion,
      e.codigo_material

    ORDER BY
      e.puesto_trabajo,
      MAX(
        e.fecha_reporte
      ) DESC,
      e.orden
  `;

  return db
    .prepare(sql)
    .all() as OperacionBolsera[];
}

/* =========================================================
   EVENTOS POR OPERACIÓN
========================================================= */

function obtenerEventos(
  operacion: OperacionBolsera
): EventoBolsera[] {
  const sql = `
    SELECT
      e.event_id,

      e.fecha_reporte,

      e.puesto_trabajo AS puesto_sap,
      mm.maquina,

      e.orden,
      e.posicion,

      e.codigo_material,
      e.nombre_material,

      e.operador,
      e.turno,

      e.cantidad_operacion,
      e.unidad_operacion,

      e.cantidad_notificada,
      e.unidad_notificada,

      e.cantidad_metros,
      e.unidad_metros,

      e.horas,

      e.desperdicio,
      e.unidad_desperdicio

    FROM events e

    INNER JOIN machine_mapping mm
      ON mm.puesto_sap =
         e.puesto_trabajo

    WHERE
      e.puesto_trabajo = ?

      AND e.orden = ?

      AND COALESCE(
        e.posicion,
        -999999
      ) =
      COALESCE(
        ?,
        -999999
      )

      AND e.codigo_material = ?

    ORDER BY
      e.fecha_reporte,
      e.turno,
      e.operador,
      e.event_id
  `;

  return db
    .prepare(sql)
    .all(
      operacion.puesto_sap,
      operacion.orden,
      operacion.posicion,
      operacion.codigo_material
    ) as EventoBolsera[];
}

/* =========================================================
   MOSTRAR RESUMEN
========================================================= */

function mostrarResumen(
  resumen: ResumenPuesto[]
): void {
  console.log(
    "\n" +
    "=".repeat(120)
  );

  console.log(
    "DIAGNOSTICO ESPECIFICO BOLSERA"
  );

  console.log(
    "=".repeat(120)
  );

  console.log(
    [
      "PUESTO".padEnd(9),
      "MAQ".padEnd(6),
      "EVENTOS".padStart(8),
      "OPS".padStart(6),
      "PLAN M".padStart(16),
      "NOTIF KG".padStart(16),
      "METROS".padStart(14),
      "HORAS".padStart(12),
      "DESP".padStart(12),
    ].join(
      " | "
    )
  );

  console.log(
    "-".repeat(120)
  );

  for (
    const row of resumen
  ) {
    console.log(
      [
        row.puesto_sap
          .padEnd(9),

        row.maquina
          .padEnd(6),

        String(
          row.eventos
        ).padStart(8),

        String(
          row.operaciones
        ).padStart(6),

        numero(
          row.plan_total
        ).padStart(16),

        numero(
          row.notificada_total
        ).padStart(16),

        numero(
          row.metros_total
        ).padStart(14),

        numero(
          row.horas_total,
          2
        ).padStart(12),

        numero(
          row.desperdicio_total
        ).padStart(12),
      ].join(
        " | "
      )
    );

    console.log(
      `          Notificada con datos: ${porcentaje(
        row.eventos_con_notificada,
        row.eventos
      )} | Metros: ${porcentaje(
        row.eventos_con_metros,
        row.eventos
      )} | Horas: ${porcentaje(
        row.eventos_con_horas,
        row.eventos
      )} | Desperdicio: ${porcentaje(
        row.eventos_con_desperdicio,
        row.eventos
      )}`
    );
  }

  console.log(
    "=".repeat(120)
  );
}

/* =========================================================
   MOSTRAR OPERACIONES
========================================================= */

function mostrarOperaciones(
  operaciones:
    OperacionBolsera[]
): void {
  for (
    const op of operaciones
  ) {
    console.log(
      "\n" +
      "#".repeat(110)
    );

    console.log(
      `PUESTO ${op.puesto_sap} -> MAQUINA ${op.maquina}`
    );

    console.log(
      "#".repeat(110)
    );

    console.log(
      `Orden:        ${op.orden}`
    );

    console.log(
      `Posicion:     ${op.posicion ?? ""}`
    );

    console.log(
      `Material:     ${op.codigo_material} - ${op.nombre_material}`
    );

    console.log(
      `Periodo:      ${op.fecha_desde} -> ${op.fecha_hasta}`
    );

    console.log(
      `Eventos:      ${op.eventos}`
    );

    console.log(
      `Operadores:   ${op.operadores || "-"}`
    );

    console.log(
      `Turnos:       ${op.turnos || "-"}`
    );

    console.log(
      ""
    );

    console.log(
      `Plan:         ${numero(op.plan)} ${op.unidad_plan || "-"}`
    );

    console.log(
      `Notificada:   ${numero(op.notificada)} ${op.unidad_notificada || "-"}`
    );

    console.log(
      `Metros:       ${numero(op.metros)} ${op.unidad_metros || "-"}`
    );

    console.log(
      `Horas:        ${numero(op.horas, 2)}`
    );

    console.log(
      `Desperdicio:  ${numero(op.desperdicio)} ${op.unidad_desperdicio || "-"}`
    );

    /*
     * Mostramos relaciones exploratorias.
     *
     * NO significan cumplimiento todavía.
     */
    if (
      op.plan > 0
    ) {
      console.log(
        ""
      );

      console.log(
        `Notificada / Plan: ${(
          (
            op.notificada /
            op.plan
          ) *
          100
        ).toFixed(2)}`
      );

      console.log(
        `Desperdicio / Plan: ${(
          (
            op.desperdicio /
            op.plan
          ) *
          100
        ).toFixed(2)}`
      );
    }

    const eventos =
      obtenerEventos(
        op
      );

    console.log(
      "\nEVENTOS SAP"
    );

    console.log(
      "-".repeat(140)
    );

    console.log(
      [
        "FECHA".padEnd(12),
        "OPERADOR".padEnd(12),
        "TURNO".padStart(5),
        "PLAN".padStart(14),
        "NOTIF".padStart(14),
        "METROS".padStart(14),
        "HORAS".padStart(10),
        "DESP".padStart(12),
      ].join(
        " | "
      )
    );

    console.log(
      "-".repeat(140)
    );

    for (
      const evento of eventos
    ) {
      console.log(
        [
          evento.fecha_reporte
            .padEnd(12),

          String(
            evento.operador ??
            "-"
          ).padEnd(12),

          String(
            evento.turno ??
            "-"
          ).padStart(5),

          numero(
            evento.cantidad_operacion
          ).padStart(14),

          numero(
            evento.cantidad_notificada
          ).padStart(14),

          numero(
            evento.cantidad_metros
          ).padStart(14),

          numero(
            evento.horas,
            2
          ).padStart(10),

          numero(
            evento.desperdicio
          ).padStart(12),
        ].join(
          " | "
        )
      );
    }

    console.log(
      "-".repeat(140)
    );
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
    "DIAGNOSTICO BOLSERA"
  );

  logger.info(
    "=================================="
  );

  const resumen =
    obtenerResumen();

  const operaciones =
    obtenerOperaciones();

  if (
    resumen.length === 0
  ) {
    throw new Error(
      "No se encontraron datos para 476P/478P."
    );
  }

  mostrarResumen(
    resumen
  );

  mostrarOperaciones(
    operaciones
  );

  logger.info(
    {
      puestos:
        resumen.length,

      operaciones:
        operaciones.length,
    },
    "Diagnostico Bolsera completado"
  );

  logger.info(
    "=================================="
  );

  logger.info(
    "FIN DIAGNOSTICO BOLSERA"
  );

  logger.info(
    "=================================="
  );
}

main();