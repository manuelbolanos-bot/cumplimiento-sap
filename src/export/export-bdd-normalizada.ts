import fs from "node:fs";
import path from "node:path";

import dayjs from "dayjs";

import {
  db,
} from "../database/db.js";

import {
  logger,
} from "../utils/logger.js";

/* =========================================================
   TIPOS
========================================================= */

interface BddExportRow {
  fuente: string;

  fecha: string;
  anio: number;
  mes: number;
  dia: number;

  maquina: string;
  seccion: string;

  puestos_sap:
    | string
    | null;

  plan: number;
  real: number;

  diferencia: number;

  cumplimiento:
    | number
    | null;

  desperdicio: number;
  horas: number;

  ordenes: number;
  registros_sap: number;

  operadores:
    | string
    | null;

  turnos:
    | string
    | null;
}

/* =========================================================
   CONFIG
========================================================= */

const EXPORT_DIR =
  path.resolve(
    "data/export"
  );

/* =========================================================
   VALIDAR VISTA
========================================================= */

function existeVista(
  nombre: string
): boolean {
  const row =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM
        sqlite_master

      WHERE
        type = 'view'
        AND name = ?
    `)
    .get(
      nombre
    ) as {
      total: number;
    };

  return row.total === 1;
}

function validarVista(): void {
  if (
    !existeVista(
      "v_cumplimiento_diario"
    )
  ) {
    throw new Error(
      "No existe v_cumplimiento_diario. Ejecuta primero la reconstrucción de vistas semánticas."
    );
  }

  if (
    !existeVista(
      "v_bdd_normalizada"
    )
  ) {
    throw new Error(
      "No existe v_bdd_normalizada. Se necesita para enriquecer metadatos SAP antes de exportar."
    );
  }
}

/* =========================================================
   FORMATEAR NUMERIC PARA BIGQUERY

   BigQuery NUMERIC admite máximo 9 decimales.

   Además eliminamos artefactos binarios como:

   112313.76000000001
   -7166.779999999999

   para obtener:

   112313.760000000
   -7166.780000000
========================================================= */

function numericBigQuery(
  valor:
    | number
    | null
    | undefined
): string {
  if (
    valor === null ||
    valor === undefined
  ) {
    return "";
  }

  const numero =
    Number(
      valor
    );

  if (
    !Number.isFinite(
      numero
    )
  ) {
    throw new Error(
      `Valor NUMERIC inválido: ${valor}`
    );
  }

  return numero.toFixed(
    9
  );
}

/* =========================================================
   FORMATEAR FLOAT

   Para FLOAT64 no necesitamos limitarlo a
   escala NUMERIC, pero evitamos artefactos
   innecesarios.
========================================================= */

function floatBigQuery(
  valor:
    | number
    | null
    | undefined,
  decimales = 9
): string {
  if (
    valor === null ||
    valor === undefined
  ) {
    return "";
  }

  const numero =
    Number(
      valor
    );

  if (
    !Number.isFinite(
      numero
    )
  ) {
    throw new Error(
      `Valor FLOAT inválido: ${valor}`
    );
  }

  /*
   * Number(...) elimina ceros finales,
   * por ejemplo:
   *
   * 24.000000000
   * ↓
   * 24
   */
  return String(
    Number(
      numero.toFixed(
        decimales
      )
    )
  );
}

/* =========================================================
   ESCAPAR CSV
========================================================= */

function escaparCsv(
  valor: unknown
): string {
  if (
    valor === null ||
    valor === undefined
  ) {
    return "";
  }

  const texto =
    String(
      valor
    );

  if (
    texto.includes(",") ||
    texto.includes('"') ||
    texto.includes("\n") ||
    texto.includes("\r")
  ) {
    return `"${texto.replace(
      /"/g,
      '""'
    )}"`;
  }

  return texto;
}

/* =========================================================
   OBTENER DATOS
========================================================= */

function obtenerDatos():
BddExportRow[] {
  /*
   * FUENTE OFICIAL DEL SNAPSHOT BI:
   *
   * v_cumplimiento_diario
   *
   * Esta vista ya integra:
   * - SAP_PRINCIPAL
   * - DRIVE_BOLSERA
   *
   * v_bdd_normalizada se usa únicamente para recuperar
   * metadatos exclusivos del flujo SAP:
   * puestos_sap, ordenes, registros_sap, operadores y turnos.
   *
   * BOLSERA no tiene esos campos, por lo que:
   * - puestos_sap = NULL
   * - ordenes = 0
   * - registros_sap = 0
   * - operadores = NULL
   * - turnos = NULL
   */
  return db.prepare(`
    WITH sap_meta AS (
      SELECT
        fecha,
        maquina,
        seccion,

        MAX(
          fuente
        ) AS fuente,

        GROUP_CONCAT(
          DISTINCT puestos_sap
        ) AS puestos_sap,

        SUM(
          COALESCE(
            ordenes,
            0
          )
        ) AS ordenes,

        SUM(
          COALESCE(
            registros_sap,
            0
          )
        ) AS registros_sap,

        GROUP_CONCAT(
          DISTINCT operadores
        ) AS operadores,

        GROUP_CONCAT(
          DISTINCT turnos
        ) AS turnos

      FROM
        v_bdd_normalizada

      GROUP BY
        fecha,
        maquina,
        seccion
    )

    SELECT
      CASE
        WHEN c.seccion =
          'BOLSERA'
          THEN
            'DRIVE_BOLSERA'

        ELSE
          COALESCE(
            s.fuente,
            'SAP_PRINCIPAL'
          )
      END AS fuente,

      c.fecha,
      c.anio,
      c.mes,
      c.dia,

      c.maquina,
      c.seccion,

      CASE
        WHEN c.seccion =
          'BOLSERA'
          THEN NULL
        ELSE
          s.puestos_sap
      END AS puestos_sap,

      c.plan,
      c.real,
      c.diferencia,
      c.cumplimiento,

      c.desperdicio,
      c.horas,

      CASE
        WHEN c.seccion =
          'BOLSERA'
          THEN 0
        ELSE
          COALESCE(
            s.ordenes,
            0
          )
      END AS ordenes,

      CASE
        WHEN c.seccion =
          'BOLSERA'
          THEN 0
        ELSE
          COALESCE(
            s.registros_sap,
            0
          )
      END AS registros_sap,

      CASE
        WHEN c.seccion =
          'BOLSERA'
          THEN NULL
        ELSE
          s.operadores
      END AS operadores,

      CASE
        WHEN c.seccion =
          'BOLSERA'
          THEN NULL
        ELSE
          s.turnos
      END AS turnos

    FROM
      v_cumplimiento_diario c

    LEFT JOIN
      sap_meta s
        ON s.fecha =
          c.fecha
        AND s.maquina =
          c.maquina
        AND s.seccion =
          c.seccion

    ORDER BY
      c.fecha,
      c.seccion,
      c.maquina
  `)
  .all() as BddExportRow[];
}

/* =========================================================
   GENERAR CSV
========================================================= */

function generarCsv(
  rows:
    BddExportRow[]
): string {
  const encabezados = [
    "fuente",

    "fecha",
    "anio",
    "mes",
    "dia",

    "maquina",
    "seccion",

    "puestos_sap",

    "plan",
    "real",
    "diferencia",
    "cumplimiento",

    "desperdicio",
    "horas",

    "ordenes",
    "registros_sap",

    "operadores",
    "turnos",
  ];

  const lineas:
    string[] = [];

  lineas.push(
    encabezados.join(
      ","
    )
  );

  for (
    const row of rows
  ) {
    /*
     * IMPORTANTE:
     *
     * plan, real, diferencia y desperdicio
     * van preparados específicamente para
     * BigQuery NUMERIC.
     *
     * cumplimiento y horas van como FLOAT64.
     */
    const valores = [
      row.fuente,

      row.fecha,
      row.anio,
      row.mes,
      row.dia,

      row.maquina,
      row.seccion,

      row.puestos_sap,

      numericBigQuery(
        row.plan
      ),

      numericBigQuery(
        row.real
      ),

      numericBigQuery(
        row.diferencia
      ),

      floatBigQuery(
        row.cumplimiento
      ),

      numericBigQuery(
        row.desperdicio
      ),

      floatBigQuery(
        row.horas
      ),

      row.ordenes,
      row.registros_sap,

      row.operadores,
      row.turnos,
    ];

    lineas.push(
      valores
        .map(
          escaparCsv
        )
        .join(
          ","
        )
    );
  }

  /*
   * BOM UTF-8 para Excel.
   */
  return (
    "\uFEFF" +
    lineas.join(
      "\r\n"
    )
  );
}

/* =========================================================
   VALIDACIONES
========================================================= */

function validarDatos(
  rows:
    BddExportRow[]
): void {
  if (
    rows.length ===
    0
  ) {
    throw new Error(
      "v_cumplimiento_diario no contiene registros para exportar."
    );
  }

  for (
    const row of rows
  ) {
    if (
      !row.fecha
    ) {
      throw new Error(
        "Se encontró un registro sin fecha."
      );
    }

    if (
      !row.maquina
    ) {
      throw new Error(
        `Se encontró un registro sin máquina. Fecha: ${row.fecha}`
      );
    }

    if (
      !row.seccion
    ) {
      throw new Error(
        `Se encontró un registro sin sección. Fecha: ${row.fecha}, máquina: ${row.maquina}`
      );
    }

    const numericos = [
      {
        campo:
          "plan",

        valor:
          row.plan,
      },

      {
        campo:
          "real",

        valor:
          row.real,
      },

      {
        campo:
          "diferencia",

        valor:
          row.diferencia,
      },

      {
        campo:
          "desperdicio",

        valor:
          row.desperdicio,
      },

      {
        campo:
          "horas",

        valor:
          row.horas,
      },
    ];

    for (
      const item of numericos
    ) {
      if (
        !Number.isFinite(
          Number(
            item.valor
          )
        )
      ) {
        throw new Error(
          `${item.campo} inválido. Fecha: ${row.fecha}, máquina: ${row.maquina}, valor: ${item.valor}`
        );
      }
    }

    if (
      row.cumplimiento !==
        null &&
      row.cumplimiento !==
        undefined &&
      !Number.isFinite(
        Number(
          row.cumplimiento
        )
      )
    ) {
      throw new Error(
        `Cumplimiento inválido. Fecha: ${row.fecha}, máquina: ${row.maquina}`
      );
    }
  }
}

/* =========================================================
   VALIDACION DE ESCALA BIGQUERY
========================================================= */

function validarEscalaBigQuery(
  rows:
    BddExportRow[]
): void {
  for (
    const row of rows
  ) {
    /*
     * Forzamos el formateo para comprobar
     * que todos los valores puedan
     * convertirse antes de generar el CSV.
     */
    numericBigQuery(
      row.plan
    );

    numericBigQuery(
      row.real
    );

    numericBigQuery(
      row.diferencia
    );

    numericBigQuery(
      row.desperdicio
    );

    floatBigQuery(
      row.horas
    );

    floatBigQuery(
      row.cumplimiento
    );
  }
}

/* =========================================================
   RESUMEN
========================================================= */

function mostrarResumen(
  rows:
    BddExportRow[],
  destino: string
): void {
  const fechas =
    rows
      .map(
        (row) =>
          row.fecha
      )
      .sort();

  const maquinas =
    new Set(
      rows.map(
        (row) =>
          row.maquina
      )
    );

  const secciones =
    new Set(
      rows.map(
        (row) =>
          row.seccion
      )
    );

  const totalPlan =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.plan ??
          0
        ),
      0
    );

  const totalReal =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.real ??
          0
        ),
      0
    );

  const cumplimiento =
    totalPlan !==
    0
      ? totalReal /
        totalPlan
      : null;

  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "EXPORTACION BDD CONSOLIDADA - SAP + BOLSERA"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `Archivo:               ${destino}`
  );

  console.log(
    `Registros exportados:  ${rows.length}`
  );

  console.log(
    `Periodo:               ${fechas[0]} -> ${fechas[fechas.length - 1]}`
  );

  console.log(
    `Maquinas:              ${maquinas.size}`
  );

  console.log(
    `Secciones:             ${secciones.size}`
  );

  console.log(
    `Plan total:            ${totalPlan.toLocaleString(
      "en-US",
      {
        maximumFractionDigits:
          3,
      }
    )}`
  );

  console.log(
    `Real total:            ${totalReal.toLocaleString(
      "en-US",
      {
        maximumFractionDigits:
          3,
      }
    )}`
  );

  console.log(
    `Cumplimiento global:   ${
      cumplimiento ===
      null
        ? "-"
        : `${(
            cumplimiento *
            100
          ).toFixed(
            2
          )}%`
    }`
  );

  const fuentes =
    new Map<
      string,
      number
    >();

  for (
    const row of rows
  ) {
    fuentes.set(
      row.fuente,
      (
        fuentes.get(
          row.fuente
        ) ??
        0
      ) +
      1
    );
  }

  console.log(
    "Fuentes:"
  );

  for (
    const [
      fuente,
      total,
    ] of fuentes
  ) {
    console.log(
      `  ${fuente.padEnd(
        18
      )} ${total}`
    );
  }

  console.log(
    "=".repeat(
      100
    )
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
    "EXPORTANDO BDD CONSOLIDADA"
  );

  logger.info(
    "=================================="
  );

  validarVista();

  const rows =
    obtenerDatos();

  validarDatos(
    rows
  );

  validarEscalaBigQuery(
    rows
  );

  fs.mkdirSync(
    EXPORT_DIR,
    {
      recursive:
        true,
    }
  );

  const timestamp =
    dayjs().format(
      "YYYYMMDD_HHmmss"
    );

  const filename =
    `bdd_normalizada_${timestamp}.csv`;

  const destino =
    path.join(
      EXPORT_DIR,
      filename
    );

  const csv =
    generarCsv(
      rows
    );

  fs.writeFileSync(
    destino,
    csv,
    {
      encoding:
        "utf8",
    }
  );

  mostrarResumen(
    rows,
    destino
  );

  logger.info(
    {
      destino,

      registros:
        rows.length,
    },
    "BDD consolidada SAP + BOLSERA exportada correctamente para BigQuery"
  );

  logger.info(
    "=================================="
  );

  logger.info(
    "EXPORTACION COMPLETADA"
  );

  logger.info(
    "=================================="
  );
}

main();