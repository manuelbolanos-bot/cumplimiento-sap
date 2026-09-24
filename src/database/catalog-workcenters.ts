import fs from "node:fs/promises";
import path from "node:path";

import { db } from "./db.js";
import { logger } from "../utils/logger.js";

/* =========================================================
   TIPOS
========================================================= */

interface PuestoCatalogoRaw {
  puesto_sap: string;

  eventos: number;
  ordenes: number;
  materiales: number;

  fecha_desde: string;
  fecha_hasta: string;

  eventos_horas: number;
  eventos_operacion: number;
  eventos_notificada: number;
  eventos_metros: number;
  eventos_desperdicio: number;

  total_horas: number;
  total_operacion_bruto: number;
  total_notificada: number;
  total_metros: number;
  total_desperdicio: number;
}

interface OperacionResumen {
  puesto_sap: string;
  operaciones_unicas: number;
  cantidad_operacion_unica: number;
}

interface UnidadResumen {
  puesto_sap: string;

  unidad_operacion: string;
  unidad_notificada: string;
  unidad_metros: string;
  unidad_desperdicio: string;

  registros: number;
}

interface CatalogoPuesto {
  puesto_sap: string;

  eventos: number;
  ordenes: number;
  materiales: number;
  operaciones_unicas: number;

  periodo_desde: string;
  periodo_hasta: string;

  unidad_operacion: string;
  unidad_notificada: string;
  unidad_metros: string;
  unidad_desperdicio: string;

  tiene_operacion: string;
  tiene_notificada: string;
  tiene_metros: string;
  tiene_horas: string;
  tiene_desperdicio: string;

  porcentaje_operacion: number;
  porcentaje_notificada: number;
  porcentaje_metros: number;
  porcentaje_horas: number;
  porcentaje_desperdicio: number;

  cantidad_operacion_unica: number;
  total_notificada: number;
  total_metros: number;
  total_horas: number;
  total_desperdicio: number;

  maquina_negocio: string;
  proceso: string;
  usar_en_cumplimiento: string;
  campo_plan: string;
  campo_real: string;
  unidad_cumplimiento: string;
  notas: string;
}

/* =========================================================
   UTILIDADES
========================================================= */

function porcentaje(
  valor: number,
  total: number
): number {
  if (
    !total ||
    total <= 0
  ) {
    return 0;
  }

  return Number(
    (
      (
        valor /
        total
      ) *
      100
    ).toFixed(2)
  );
}

function siNo(
  cantidad: number
): string {
  return cantidad > 0
    ? "SI"
    : "NO";
}

function numero(
  valor: number
): string {
  return Number(
    valor ?? 0
  ).toLocaleString(
    "en-US",
    {
      maximumFractionDigits: 3,
    }
  );
}

/* =========================================================
   ESCAPE CSV
========================================================= */

function csvEscape(
  valor: unknown
): string {
  if (
    valor === null ||
    valor === undefined
  ) {
    return "";
  }

  const texto =
    String(valor);

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
   OBTENER RESUMEN PRINCIPAL
========================================================= */

function obtenerPuestos():
PuestoCatalogoRaw[] {
  const sql = `
    SELECT
      puesto_trabajo AS puesto_sap,

      COUNT(*) AS eventos,

      COUNT(
        DISTINCT orden
      ) AS ordenes,

      COUNT(
        DISTINCT codigo_material
      ) AS materiales,

      MIN(
        fecha_reporte
      ) AS fecha_desde,

      MAX(
        fecha_reporte
      ) AS fecha_hasta,

      SUM(
        CASE
          WHEN COALESCE(horas, 0) <> 0
          THEN 1
          ELSE 0
        END
      ) AS eventos_horas,

      SUM(
        CASE
          WHEN COALESCE(cantidad_operacion, 0) <> 0
          THEN 1
          ELSE 0
        END
      ) AS eventos_operacion,

      SUM(
        CASE
          WHEN COALESCE(cantidad_notificada, 0) <> 0
          THEN 1
          ELSE 0
        END
      ) AS eventos_notificada,

      SUM(
        CASE
          WHEN COALESCE(cantidad_metros, 0) <> 0
          THEN 1
          ELSE 0
        END
      ) AS eventos_metros,

      SUM(
        CASE
          WHEN COALESCE(desperdicio, 0) <> 0
          THEN 1
          ELSE 0
        END
      ) AS eventos_desperdicio,

      SUM(
        COALESCE(horas, 0)
      ) AS total_horas,

      SUM(
        COALESCE(cantidad_operacion, 0)
      ) AS total_operacion_bruto,

      SUM(
        COALESCE(cantidad_notificada, 0)
      ) AS total_notificada,

      SUM(
        COALESCE(cantidad_metros, 0)
      ) AS total_metros,

      SUM(
        COALESCE(desperdicio, 0)
      ) AS total_desperdicio

    FROM events

    WHERE
      TRIM(
        COALESCE(
          puesto_trabajo,
          ''
        )
      ) <> ''

    GROUP BY
      puesto_trabajo

    ORDER BY
      puesto_trabajo
  `;

  return db
    .prepare(sql)
    .all() as PuestoCatalogoRaw[];
}

/* =========================================================
   OBTENER OPERACIONES ÚNICAS

   La cantidad_operacion no puede sumarse por evento,
   porque SAP la repite en múltiples notificaciones.

   Por ahora usamos:

   puesto
   + orden
   + posición
   + código material
========================================================= */

function obtenerOperaciones():
Map<string, OperacionResumen> {
  const sql = `
    WITH operaciones AS (
      SELECT
        puesto_trabajo AS puesto_sap,
        orden,
        posicion,
        codigo_material,

        MAX(
          COALESCE(
            cantidad_operacion,
            0
          )
        ) AS cantidad_operacion

      FROM events

      WHERE
        TRIM(
          COALESCE(
            puesto_trabajo,
            ''
          )
        ) <> ''

      GROUP BY
        puesto_trabajo,
        orden,
        posicion,
        codigo_material
    )

    SELECT
      puesto_sap,

      COUNT(*) AS operaciones_unicas,

      SUM(
        cantidad_operacion
      ) AS cantidad_operacion_unica

    FROM operaciones

    GROUP BY
      puesto_sap

    ORDER BY
      puesto_sap
  `;

  const rows =
    db
      .prepare(sql)
      .all() as OperacionResumen[];

  const mapa =
    new Map<
      string,
      OperacionResumen
    >();

  for (
    const row of rows
  ) {
    mapa.set(
      row.puesto_sap,
      row
    );
  }

  return mapa;
}

/* =========================================================
   OBTENER COMBINACIÓN PRINCIPAL DE UNIDADES

   Elegimos la combinación que aparece con mayor
   frecuencia por puesto.
========================================================= */

function obtenerUnidadesPrincipales():
Map<string, UnidadResumen> {
  const sql = `
    SELECT
      puesto_trabajo AS puesto_sap,

      COALESCE(
        unidad_operacion,
        ''
      ) AS unidad_operacion,

      COALESCE(
        unidad_notificada,
        ''
      ) AS unidad_notificada,

      COALESCE(
        unidad_metros,
        ''
      ) AS unidad_metros,

      COALESCE(
        unidad_desperdicio,
        ''
      ) AS unidad_desperdicio,

      COUNT(*) AS registros

    FROM events

    WHERE
      TRIM(
        COALESCE(
          puesto_trabajo,
          ''
        )
      ) <> ''

    GROUP BY
      puesto_trabajo,
      unidad_operacion,
      unidad_notificada,
      unidad_metros,
      unidad_desperdicio

    ORDER BY
      puesto_trabajo,
      registros DESC
  `;

  const rows =
    db
      .prepare(sql)
      .all() as UnidadResumen[];

  const mapa =
    new Map<
      string,
      UnidadResumen
    >();

  for (
    const row of rows
  ) {
    /*
     * La consulta viene ordenada por registros DESC.
     *
     * La primera combinación encontrada para cada
     * puesto es la dominante.
     */
    if (
      !mapa.has(
        row.puesto_sap
      )
    ) {
      mapa.set(
        row.puesto_sap,
        row
      );
    }
  }

  return mapa;
}

/* =========================================================
   CONSTRUIR CATÁLOGO
========================================================= */

function construirCatalogo():
CatalogoPuesto[] {
  const puestos =
    obtenerPuestos();

  const operaciones =
    obtenerOperaciones();

  const unidades =
    obtenerUnidadesPrincipales();

  return puestos.map(
    (
      puesto
    ): CatalogoPuesto => {
      const operacion =
        operaciones.get(
          puesto.puesto_sap
        );

      const unidad =
        unidades.get(
          puesto.puesto_sap
        );

      return {
        puesto_sap:
          puesto.puesto_sap,

        eventos:
          puesto.eventos,

        ordenes:
          puesto.ordenes,

        materiales:
          puesto.materiales,

        operaciones_unicas:
          operacion
            ?.operaciones_unicas ??
          0,

        periodo_desde:
          puesto.fecha_desde,

        periodo_hasta:
          puesto.fecha_hasta,

        unidad_operacion:
          unidad
            ?.unidad_operacion ||
          "",

        unidad_notificada:
          unidad
            ?.unidad_notificada ||
          "",

        unidad_metros:
          unidad
            ?.unidad_metros ||
          "",

        unidad_desperdicio:
          unidad
            ?.unidad_desperdicio ||
          "",

        tiene_operacion:
          siNo(
            puesto.eventos_operacion
          ),

        tiene_notificada:
          siNo(
            puesto.eventos_notificada
          ),

        tiene_metros:
          siNo(
            puesto.eventos_metros
          ),

        tiene_horas:
          siNo(
            puesto.eventos_horas
          ),

        tiene_desperdicio:
          siNo(
            puesto.eventos_desperdicio
          ),

        porcentaje_operacion:
          porcentaje(
            puesto.eventos_operacion,
            puesto.eventos
          ),

        porcentaje_notificada:
          porcentaje(
            puesto.eventos_notificada,
            puesto.eventos
          ),

        porcentaje_metros:
          porcentaje(
            puesto.eventos_metros,
            puesto.eventos
          ),

        porcentaje_horas:
          porcentaje(
            puesto.eventos_horas,
            puesto.eventos
          ),

        porcentaje_desperdicio:
          porcentaje(
            puesto.eventos_desperdicio,
            puesto.eventos
          ),

        cantidad_operacion_unica:
          operacion
            ?.cantidad_operacion_unica ??
          0,

        total_notificada:
          puesto.total_notificada,

        total_metros:
          puesto.total_metros,

        total_horas:
          puesto.total_horas,

        total_desperdicio:
          puesto.total_desperdicio,

        /*
         * CAMPOS DE NEGOCIO
         *
         * Se dejan deliberadamente vacíos.
         *
         * No inferimos todavía:
         *
         * puesto SAP = máquina
         * proceso
         * plan
         * real
         */
        maquina_negocio:
          "",

        proceso:
          "",

        usar_en_cumplimiento:
          "",

        campo_plan:
          "",

        campo_real:
          "",

        unidad_cumplimiento:
          "",

        notas:
          "",
      };
    }
  );
}

/* =========================================================
   MOSTRAR RESUMEN EN CONSOLA
========================================================= */

function mostrarCatalogo(
  catalogo: CatalogoPuesto[]
): void {
  console.log(
    "\n" +
    "=".repeat(125)
  );

  console.log(
    "CATALOGO TECNICO DE PUESTOS SAP"
  );

  console.log(
    "=".repeat(125)
  );

  console.log(
    [
      "PUESTO".padEnd(10),
      "EVENTOS".padStart(8),
      "OPS".padStart(6),
      "METROS".padStart(10),
      "HORAS".padStart(10),
      "DESP".padStart(10),
      "U.OP".padEnd(8),
      "U.NOT".padEnd(8),
      "PERIODO",
    ].join(
      " | "
    )
  );

  console.log(
    "-".repeat(125)
  );

  for (
    const row of catalogo
  ) {
    console.log(
      [
        row.puesto_sap
          .padEnd(10),

        String(
          row.eventos
        )
          .padStart(8),

        String(
          row.operaciones_unicas
        )
          .padStart(6),

        `${row.porcentaje_metros.toFixed(1)}%`
          .padStart(10),

        `${row.porcentaje_horas.toFixed(1)}%`
          .padStart(10),

        `${row.porcentaje_desperdicio.toFixed(1)}%`
          .padStart(10),

        (
          row.unidad_operacion ||
          "-"
        )
          .padEnd(8),

        (
          row.unidad_notificada ||
          "-"
        )
          .padEnd(8),

        `${row.periodo_desde} -> ${row.periodo_hasta}`,
      ].join(
        " | "
      )
    );
  }

  console.log(
    "=".repeat(125)
  );
}

/* =========================================================
   CREAR CSV
========================================================= */

async function escribirCsv(
  catalogo: CatalogoPuesto[]
): Promise<string> {
  const directorio =
    path.resolve(
      process.cwd(),
      "data",
      "diagnostics"
    );

  await fs.mkdir(
    directorio,
    {
      recursive: true,
    }
  );

  const destino =
    path.join(
      directorio,
      "catalogo-puestos-sap.csv"
    );

  const columnas:
    Array<
      keyof CatalogoPuesto
    > = [
      "puesto_sap",

      "eventos",
      "ordenes",
      "materiales",
      "operaciones_unicas",

      "periodo_desde",
      "periodo_hasta",

      "unidad_operacion",
      "unidad_notificada",
      "unidad_metros",
      "unidad_desperdicio",

      "tiene_operacion",
      "tiene_notificada",
      "tiene_metros",
      "tiene_horas",
      "tiene_desperdicio",

      "porcentaje_operacion",
      "porcentaje_notificada",
      "porcentaje_metros",
      "porcentaje_horas",
      "porcentaje_desperdicio",

      "cantidad_operacion_unica",
      "total_notificada",
      "total_metros",
      "total_horas",
      "total_desperdicio",

      "maquina_negocio",
      "proceso",
      "usar_en_cumplimiento",
      "campo_plan",
      "campo_real",
      "unidad_cumplimiento",
      "notas",
    ];

  const lineas:
    string[] = [];

  lineas.push(
    columnas.join(
      ","
    )
  );

  for (
    const row of catalogo
  ) {
    const linea =
      columnas
        .map(
          (
            columna
          ) =>
            csvEscape(
              row[columna]
            )
        )
        .join(
          ","
        );

    lineas.push(
      linea
    );
  }

  /*
   * UTF-8 BOM.
   *
   * Ayuda a que Excel en Windows abra correctamente
   * caracteres especiales.
   */
  const contenido =
    "\uFEFF" +
    lineas.join(
      "\r\n"
    );

  await fs.writeFile(
    destino,
    contenido,
    "utf8"
  );

  return destino;
}

/* =========================================================
   ESTADÍSTICAS GENERALES
========================================================= */

function mostrarEstadisticas(
  catalogo: CatalogoPuesto[]
): void {
  const conMetros =
    catalogo.filter(
      (row) =>
        row.tiene_metros ===
        "SI"
    ).length;

  const conHoras =
    catalogo.filter(
      (row) =>
        row.tiene_horas ===
        "SI"
    ).length;

  const conDesperdicio =
    catalogo.filter(
      (row) =>
        row.tiene_desperdicio ===
        "SI"
    ).length;

  const sinMetros =
    catalogo.filter(
      (row) =>
        row.tiene_metros ===
        "NO"
    ).length;

  console.log(
    "\nRESUMEN"
  );

  console.log(
    "-".repeat(50)
  );

  console.log(
    `Puestos totales:             ${catalogo.length}`
  );

  console.log(
    `Puestos con metros:          ${conMetros}`
  );

  console.log(
    `Puestos sin metros:          ${sinMetros}`
  );

  console.log(
    `Puestos con horas:           ${conHoras}`
  );

  console.log(
    `Puestos con desperdicio:     ${conDesperdicio}`
  );
}

/* =========================================================
   MAIN
========================================================= */

async function main():
Promise<void> {
  logger.info(
    "=================================="
  );

  logger.info(
    "CATALOGO DE PUESTOS SAP"
  );

  logger.info(
    "=================================="
  );

  const catalogo =
    construirCatalogo();

  if (
    catalogo.length === 0
  ) {
    throw new Error(
      "No existen puestos SAP en la tabla events."
    );
  }

  mostrarCatalogo(
    catalogo
  );

  mostrarEstadisticas(
    catalogo
  );

  const destino =
    await escribirCsv(
      catalogo
    );

  logger.info(
    {
      puestos:
        catalogo.length,

      destino,
    },
    "Catálogo de puestos SAP generado"
  );

  logger.info(
    "=================================="
  );

  logger.info(
    "CATALOGO COMPLETADO"
  );

  logger.info(
    "=================================="
  );
}

main().catch(
  (error) => {
    logger.error(
      error,
      "Error generando catálogo de puestos SAP"
    );

    process.exit(1);
  }
);