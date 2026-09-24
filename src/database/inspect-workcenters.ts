import { db } from "./db.js";
import { logger } from "../utils/logger.js";

interface PerfilPuesto {
  puesto_trabajo: string;

  eventos: number;
  ordenes: number;
  materiales: number;

  fecha_desde: string;
  fecha_hasta: string;

  con_horas: number;
  con_operacion: number;
  con_notificada: number;
  con_metros: number;
  con_desperdicio: number;

  suma_horas: number;
  suma_operacion: number;
  suma_notificada: number;
  suma_metros: number;
  suma_desperdicio: number;
}

interface UnidadPuesto {
  puesto_trabajo: string;

  unidad_operacion: string;
  unidad_notificada: string;
  unidad_metros: string;
  unidad_desperdicio: string;

  registros: number;
}

interface OperacionUnica {
  puesto_trabajo: string;
  operaciones_unicas: number;
  plan_unico: number;
}

interface Ejemplo {
  puesto_trabajo: string;
  fecha_reporte: string;
  orden: string;
  pedido: string;
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

  desperdicio: number;
  unidad_desperdicio: string;

  horas: number;
}

/* =========================================================
   FORMATO
========================================================= */

function numero(
  value: number | null | undefined
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "0";
  }

  return Number(value)
    .toLocaleString(
      "en-US",
      {
        maximumFractionDigits: 3,
      }
    );
}

function texto(
  value: string | null | undefined
): string {
  return value?.trim() || "-";
}

/* =========================================================
   PERFIL GENERAL
========================================================= */

function obtenerPerfiles():
PerfilPuesto[] {
  return db
    .prepare(
      `
      SELECT
        puesto_trabajo,

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
        ) AS con_horas,

        SUM(
          CASE
            WHEN COALESCE(cantidad_operacion, 0) <> 0
            THEN 1
            ELSE 0
          END
        ) AS con_operacion,

        SUM(
          CASE
            WHEN COALESCE(cantidad_notificada, 0) <> 0
            THEN 1
            ELSE 0
          END
        ) AS con_notificada,

        SUM(
          CASE
            WHEN COALESCE(cantidad_metros, 0) <> 0
            THEN 1
            ELSE 0
          END
        ) AS con_metros,

        SUM(
          CASE
            WHEN COALESCE(desperdicio, 0) <> 0
            THEN 1
            ELSE 0
          END
        ) AS con_desperdicio,

        SUM(
          COALESCE(horas, 0)
        ) AS suma_horas,

        SUM(
          COALESCE(cantidad_operacion, 0)
        ) AS suma_operacion,

        SUM(
          COALESCE(cantidad_notificada, 0)
        ) AS suma_notificada,

        SUM(
          COALESCE(cantidad_metros, 0)
        ) AS suma_metros,

        SUM(
          COALESCE(desperdicio, 0)
        ) AS suma_desperdicio

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
      `
    )
    .all() as PerfilPuesto[];
}

/* =========================================================
   UNIDADES POR PUESTO
========================================================= */

function obtenerUnidades():
Map<string, UnidadPuesto[]> {
  const rows =
    db
      .prepare(
        `
        SELECT
          puesto_trabajo,

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
        `
      )
      .all() as UnidadPuesto[];

  const resultado =
    new Map<
      string,
      UnidadPuesto[]
    >();

  for (
    const row of rows
  ) {
    const actual =
      resultado.get(
        row.puesto_trabajo
      ) ?? [];

    actual.push(
      row
    );

    resultado.set(
      row.puesto_trabajo,
      actual
    );
  }

  return resultado;
}

/* =========================================================
   OPERACIONES ÚNICAS

   Por ahora consideramos una operación identificada por:

   puesto
   + orden
   + posición
   + material

   La cantidad_operacion se toma UNA SOLA VEZ.

   Esto evita inflar el Plan por las múltiples
   notificaciones SAP.
========================================================= */

function obtenerOperacionesUnicas():
Map<string, OperacionUnica> {
  const rows =
    db
      .prepare(
        `
        WITH operaciones AS (
          SELECT
            puesto_trabajo,
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
          puesto_trabajo,

          COUNT(*) AS operaciones_unicas,

          SUM(
            cantidad_operacion
          ) AS plan_unico

        FROM operaciones

        GROUP BY
          puesto_trabajo

        ORDER BY
          puesto_trabajo
        `
      )
      .all() as OperacionUnica[];

  const mapa =
    new Map<
      string,
      OperacionUnica
    >();

  for (
    const row of rows
  ) {
    mapa.set(
      row.puesto_trabajo,
      row
    );
  }

  return mapa;
}

/* =========================================================
   EJEMPLOS POR PUESTO

   Máximo 3 eventos representativos.
========================================================= */

function obtenerEjemplos(
  puesto: string
): Ejemplo[] {
  return db
    .prepare(
      `
      SELECT
        puesto_trabajo,
        fecha_reporte,
        orden,
        pedido,
        posicion,

        codigo_material,
        nombre_material,

        operador,
        turno,

        cantidad_operacion,
        unidad_operacion,

        cantidad_notificada,
        unidad_notificada,

        cantidad_metros,
        unidad_metros,

        desperdicio,
        unidad_desperdicio,

        horas

      FROM events

      WHERE
        puesto_trabajo = ?

      ORDER BY
        fecha_reporte DESC,
        orden DESC

      LIMIT 3
      `
    )
    .all(
      puesto
    ) as Ejemplo[];
}

/* =========================================================
   MOSTRAR PERFIL
========================================================= */

function mostrarPerfil(
  perfil: PerfilPuesto,

  unidades:
    UnidadPuesto[],

  operacion:
    OperacionUnica | undefined
): void {
  console.log(
    "\n" +
    "=".repeat(72)
  );

  console.log(
    `PUESTO SAP: ${perfil.puesto_trabajo}`
  );

  console.log(
    "=".repeat(72)
  );

  console.log(
    `Periodo:              ${perfil.fecha_desde} -> ${perfil.fecha_hasta}`
  );

  console.log(
    `Eventos:              ${numero(perfil.eventos)}`
  );

  console.log(
    `Ordenes distintas:    ${numero(perfil.ordenes)}`
  );

  console.log(
    `Materiales distintos: ${numero(perfil.materiales)}`
  );

  console.log(
    `Operaciones unicas:   ${numero(
      operacion?.operaciones_unicas
    )}`
  );

  console.log(
    "\nCAMPOS CON DATOS"
  );

  console.log(
    `  Horas:                 ${numero(perfil.con_horas)}`
  );

  console.log(
    `  Cantidad operacion:    ${numero(perfil.con_operacion)}`
  );

  console.log(
    `  Cantidad notificada:   ${numero(perfil.con_notificada)}`
  );

  console.log(
    `  Cantidad metros:       ${numero(perfil.con_metros)}`
  );

  console.log(
    `  Desperdicio:           ${numero(perfil.con_desperdicio)}`
  );

  console.log(
    "\nTOTALES BRUTOS SAP"
  );

  console.log(
    `  Horas:                 ${numero(perfil.suma_horas)}`
  );

  console.log(
    `  Cantidad operacion:    ${numero(perfil.suma_operacion)}`
  );

  console.log(
    `  Cantidad notificada:   ${numero(perfil.suma_notificada)}`
  );

  console.log(
    `  Cantidad metros:       ${numero(perfil.suma_metros)}`
  );

  console.log(
    `  Desperdicio:           ${numero(perfil.suma_desperdicio)}`
  );

  console.log(
    "\nOPERACION SIN DUPLICAR"
  );

  console.log(
    `  Cantidad operacion unica: ${numero(
      operacion?.plan_unico
    )}`
  );

  console.log(
    "\nCOMBINACIONES DE UNIDADES"
  );

  if (
    unidades.length === 0
  ) {
    console.log(
      "  Sin unidades detectadas"
    );
  } else {
    for (
      const unidad of unidades
    ) {
      console.log(
        [
          `  Registros=${numero(
            unidad.registros
          )}`,
          `Operacion=${texto(
            unidad.unidad_operacion
          )}`,
          `Notificada=${texto(
            unidad.unidad_notificada
          )}`,
          `Metros=${texto(
            unidad.unidad_metros
          )}`,
          `Desperdicio=${texto(
            unidad.unidad_desperdicio
          )}`,
        ].join(
          " | "
        )
      );
    }
  }

  const ejemplos =
    obtenerEjemplos(
      perfil.puesto_trabajo
    );

  console.log(
    "\nEJEMPLOS"
  );

  for (
    const ejemplo of ejemplos
  ) {
    console.log(
      "-".repeat(72)
    );

    console.log(
      `Fecha: ${ejemplo.fecha_reporte}`
    );

    console.log(
      `Orden: ${ejemplo.orden} | Pedido: ${ejemplo.pedido} | Pos: ${ejemplo.posicion ?? ""}`
    );

    console.log(
      `Material: ${ejemplo.codigo_material} - ${ejemplo.nombre_material}`
    );

    console.log(
      `Operador: ${ejemplo.operador || "-"} | Turno: ${ejemplo.turno ?? "-"}`
    );

    console.log(
      `Operacion: ${numero(ejemplo.cantidad_operacion)} ${texto(
        ejemplo.unidad_operacion
      )}`
    );

    console.log(
      `Notificada: ${numero(ejemplo.cantidad_notificada)} ${texto(
        ejemplo.unidad_notificada
      )}`
    );

    console.log(
      `Metros: ${numero(ejemplo.cantidad_metros)} ${texto(
        ejemplo.unidad_metros
      )}`
    );

    console.log(
      `Desperdicio: ${numero(ejemplo.desperdicio)} ${texto(
        ejemplo.unidad_desperdicio
      )}`
    );

    console.log(
      `Horas: ${numero(ejemplo.horas)}`
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
    "PERFIL DE PUESTOS SAP"
  );

  logger.info(
    "=================================="
  );

  const perfiles =
    obtenerPerfiles();

  const unidades =
    obtenerUnidades();

  const operaciones =
    obtenerOperacionesUnicas();

  console.log(
    "\n" +
    "#".repeat(72)
  );

  console.log(
    "PERFIL INDUSTRIAL DE PUESTOS SAP"
  );

  console.log(
    "#".repeat(72)
  );

  console.log(
    `\nPuestos detectados: ${perfiles.length}`
  );

  const eventosTotales =
    perfiles.reduce(
      (
        total,
        perfil
      ) =>
        total +
        perfil.eventos,
      0
    );

  console.log(
    `Eventos totales:    ${numero(eventosTotales)}`
  );

  for (
    const perfil of perfiles
  ) {
    mostrarPerfil(
      perfil,

      unidades.get(
        perfil.puesto_trabajo
      ) ?? [],

      operaciones.get(
        perfil.puesto_trabajo
      )
    );
  }

  logger.info(
    {
      puestosDetectados:
        perfiles.length,

      eventosTotales,
    },
    "Perfil de puestos completado"
  );

  logger.info(
    "=================================="
  );

  logger.info(
    "DIAGNOSTICO COMPLETADO"
  );

  logger.info(
    "=================================="
  );
}

main();