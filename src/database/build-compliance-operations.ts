import crypto from "node:crypto";

import {
  db,
} from "./db.js";

import {
  logger,
} from "../utils/logger.js";

/* =========================================================
   TIPOS
========================================================= */

interface OperacionFuente {
  puesto_sap: string;
  maquina: string;
  proceso: string;

  orden: string;
  posicion: number | null;

  codigo_material: string;
  nombre_material: string;

  fecha_desde: string;
  fecha_hasta: string;

  eventos: number;

  plan: number;
  real_metros: number;

  horas: number;
  desperdicio: number;

  unidad_operacion: string;
  unidad_metros: string;

  operadores: string;
  turnos: string;
}

interface OperacionCandidate {
  operation_id: string;

  puesto_sap: string;
  maquina: string;
  proceso: string;

  orden: string;
  posicion: number | null;

  codigo_material: string;
  nombre_material: string;

  fecha_desde: string;
  fecha_hasta: string;

  eventos: number;

  plan: number;
  real: number | null;

  diferencia: number | null;
  cumplimiento: number | null;

  unidad: string | null;

  horas: number;
  desperdicio: number;

  operadores: string;
  turnos: string;

  es_prueba: number;
  sin_plan: number;
  sin_real: number;

  cumplimiento_bajo: number;
  cumplimiento_alto: number;

  requiere_revision: number;

  estado_validacion: string;

  notas: string;
}

/* =========================================================
   CONFIGURACIÓN

   Estos son los puestos donde ya estamos probando:

   PLAN = cantidad_operacion
   REAL = cantidad_metros

   Bolsera queda fuera temporalmente.
========================================================= */

const PUESTOS_CON_REGLA_METROS =
  new Set([
    "410P",
    "424P",
    "429P",

    "430P",
    "444P",
    "446P",
    "447SB",
    "447SL",

    "431P",
    "465P",
  ]);

/* =========================================================
   UTILIDADES
========================================================= */

function toNumber(
  value: unknown
): number {
  const numero =
    Number(value ?? 0);

  return Number.isFinite(
    numero
  )
    ? numero
    : 0;
}

function round(
  value: number,
  decimals = 4
): number {
  const factor =
    10 ** decimals;

  return (
    Math.round(
      value *
        factor
    ) /
    factor
  );
}

function crearOperationId(
  row: OperacionFuente
): string {
  const base = [
    row.puesto_sap,
    row.orden,
    row.posicion ?? "",
    row.codigo_material,
  ].join("|");

  return crypto
    .createHash(
      "sha256"
    )
    .update(
      base
    )
    .digest(
      "hex"
    );
}

/* =========================================================
   CREAR TABLA
========================================================= */

function crearTabla():
void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS compliance_operations_candidate (
      operation_id TEXT PRIMARY KEY,

      puesto_sap TEXT NOT NULL,
      maquina TEXT NOT NULL,
      proceso TEXT NOT NULL,

      orden TEXT NOT NULL,
      posicion INTEGER,

      codigo_material TEXT NOT NULL,
      nombre_material TEXT,

      fecha_desde TEXT NOT NULL,
      fecha_hasta TEXT NOT NULL,

      eventos INTEGER NOT NULL,

      plan REAL NOT NULL,
      real REAL,

      diferencia REAL,
      cumplimiento REAL,

      unidad TEXT,

      horas REAL NOT NULL DEFAULT 0,
      desperdicio REAL NOT NULL DEFAULT 0,

      operadores TEXT,
      turnos TEXT,

      es_prueba INTEGER NOT NULL DEFAULT 0,
      sin_plan INTEGER NOT NULL DEFAULT 0,
      sin_real INTEGER NOT NULL DEFAULT 0,

      cumplimiento_bajo INTEGER NOT NULL DEFAULT 0,
      cumplimiento_alto INTEGER NOT NULL DEFAULT 0,

      requiere_revision INTEGER NOT NULL DEFAULT 0,

      estado_validacion TEXT NOT NULL,

      notas TEXT,

      generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS
      idx_compliance_candidate_maquina
      ON compliance_operations_candidate (
        maquina
      );

    CREATE INDEX IF NOT EXISTS
      idx_compliance_candidate_proceso
      ON compliance_operations_candidate (
        proceso
      );

    CREATE INDEX IF NOT EXISTS
      idx_compliance_candidate_fecha
      ON compliance_operations_candidate (
        fecha_desde,
        fecha_hasta
      );

    CREATE INDEX IF NOT EXISTS
      idx_compliance_candidate_revision
      ON compliance_operations_candidate (
        requiere_revision
      );
  `);
}

/* =========================================================
   OBTENER OPERACIONES DESDE SAP

   Importante:

   - cantidad_operacion:
     se toma UNA SOLA VEZ usando MAX.

   - cantidad_metros:
     se acumula porque corresponde a las
     diferentes notificaciones de esa operación.
========================================================= */

function obtenerOperaciones():
OperacionFuente[] {
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
          e.cantidad_metros,
          0
        )
      ) AS real_metros,

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
      ) AS unidad_operacion,

      MAX(
        COALESCE(
          e.unidad_metros,
          ''
        )
      ) AS unidad_metros,

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

    GROUP BY
      e.puesto_trabajo,
      mm.maquina,
      mm.proceso,
      e.orden,
      e.posicion,
      e.codigo_material

    ORDER BY
      mm.proceso,
      mm.maquina,
      e.puesto_trabajo,
      MAX(
        e.fecha_reporte
      ),
      e.orden
  `;

  return db
    .prepare(sql)
    .all() as OperacionFuente[];
}

/* =========================================================
   DETECTAR ORDEN DE PRUEBA
========================================================= */

function detectarPrueba(
  row: OperacionFuente
): boolean {
  const material =
    `${row.codigo_material} ${row.nombre_material}`
      .toUpperCase();

  /*
   * Regla explícita conocida en la muestra.
   *
   * 10249848 apareció como:
   * ORDEN DE PRUEBA DE MAQUINA
   */
  if (
    row.codigo_material ===
    "10249848"
  ) {
    return true;
  }

  if (
    material.includes(
      "PRUEBA"
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   CONSTRUIR OPERACIÓN CANDIDATA
========================================================= */

function transformarOperacion(
  row: OperacionFuente
): OperacionCandidate {
  const plan =
    toNumber(
      row.plan
    );

  const tieneRegla =
    PUESTOS_CON_REGLA_METROS.has(
      row.puesto_sap
    );

  /*
   * Bolsera y cualquier otro puesto todavía
   * sin regla queda con REAL = NULL.
   */
  const real =
    tieneRegla
      ? toNumber(
          row.real_metros
        )
      : null;

  const sinPlan =
    plan <= 0;

  const sinReal =
    tieneRegla &&
    (
      real === null ||
      real <= 0
    );

  let diferencia:
    number | null =
    null;

  let cumplimiento:
    number | null =
    null;

  if (
    tieneRegla &&
    !sinPlan &&
    real !== null
  ) {
    diferencia =
      round(
        real -
          plan
      );

    cumplimiento =
      round(
        (
          real /
          plan
        ) *
          100,
        2
      );
  }

  const esPrueba =
    detectarPrueba(
      row
    );

  /*
   * Estas bandas NO son las bandas definitivas
   * del dashboard.
   *
   * Aquí se utilizan solamente para encontrar
   * valores que merecen revisión técnica.
   */
  const cumplimientoBajo =
    cumplimiento !== null &&
    cumplimiento < 50;

  const cumplimientoAlto =
    cumplimiento !== null &&
    cumplimiento > 130;

  /*
   * Requiere revisión si:
   *
   * - es prueba
   * - no tiene Plan
   * - siendo un puesto de metros, no tiene Real
   * - cumplimiento extremadamente bajo
   * - cumplimiento extremadamente alto
   * - todavía no tiene una regla definida
   */
  const requiereRevision =
    esPrueba ||
    sinPlan ||
    sinReal ||
    cumplimientoBajo ||
    cumplimientoAlto ||
    !tieneRegla;

  let estadoValidacion =
    "CANDIDATO";

  let notas =
    "";

  if (
    !tieneRegla
  ) {
    estadoValidacion =
      "PENDIENTE_REGLA";

    notas =
      "Puesto mapeado, pero todavía no existe una regla validada para obtener el Real.";
  } else if (
    esPrueba
  ) {
    estadoValidacion =
      "EXCLUIR_PRUEBA";

    notas =
      "Orden o material identificado como prueba de máquina.";
  } else if (
    sinPlan
  ) {
    estadoValidacion =
      "REVISAR_SIN_PLAN";

    notas =
      "La operación no contiene cantidad_operacion válida.";
  } else if (
    sinReal
  ) {
    estadoValidacion =
      "REVISAR_SIN_REAL";

    notas =
      "La operación no contiene cantidad_metros mayor que cero.";
  } else if (
    cumplimientoBajo
  ) {
    estadoValidacion =
      "REVISAR_CUMP_BAJO";

    notas =
      "Cumplimiento candidato inferior a 50%.";
  } else if (
    cumplimientoAlto
  ) {
    estadoValidacion =
      "REVISAR_CUMP_ALTO";

    notas =
      "Cumplimiento candidato superior a 130%.";
  }

  /*
   * La unidad solamente se declara M cuando
   * Plan y Real son comparables en metros.
   */
  const unidad =
    tieneRegla
      ? "M"
      : null;

  return {
    operation_id:
      crearOperationId(
        row
      ),

    puesto_sap:
      row.puesto_sap,

    maquina:
      row.maquina,

    proceso:
      row.proceso,

    orden:
      String(
        row.orden
      ),

    posicion:
      row.posicion,

    codigo_material:
      String(
        row.codigo_material
      ),

    nombre_material:
      row.nombre_material ??
      "",

    fecha_desde:
      row.fecha_desde,

    fecha_hasta:
      row.fecha_hasta,

    eventos:
      Number(
        row.eventos
      ),

    plan:
      round(
        plan
      ),

    real:
      real === null
        ? null
        : round(
            real
          ),

    diferencia,

    cumplimiento,

    unidad,

    horas:
      round(
        toNumber(
          row.horas
        ),
        2
      ),

    desperdicio:
      round(
        toNumber(
          row.desperdicio
        ),
        3
      ),

    operadores:
      row.operadores ??
      "",

    turnos:
      row.turnos ??
      "",

    es_prueba:
      esPrueba
        ? 1
        : 0,

    sin_plan:
      sinPlan
        ? 1
        : 0,

    sin_real:
      sinReal
        ? 1
        : 0,

    cumplimiento_bajo:
      cumplimientoBajo
        ? 1
        : 0,

    cumplimiento_alto:
      cumplimientoAlto
        ? 1
        : 0,

    requiere_revision:
      requiereRevision
        ? 1
        : 0,

    estado_validacion:
      estadoValidacion,

    notas,
  };
}

/* =========================================================
   GUARDAR OPERACIONES
========================================================= */

function guardarOperaciones(
  operaciones:
    OperacionCandidate[]
): void {
  /*
   * Es una tabla derivada.
   *
   * Por ahora la reconstruimos completamente cada vez.
   * events continúa siendo nuestra fuente operativa.
   */
  const limpiar =
    db.prepare(`
      DELETE FROM
        compliance_operations_candidate
    `);

  const insertar =
    db.prepare(`
      INSERT INTO compliance_operations_candidate (
        operation_id,

        puesto_sap,
        maquina,
        proceso,

        orden,
        posicion,

        codigo_material,
        nombre_material,

        fecha_desde,
        fecha_hasta,

        eventos,

        plan,
        real,

        diferencia,
        cumplimiento,

        unidad,

        horas,
        desperdicio,

        operadores,
        turnos,

        es_prueba,
        sin_plan,
        sin_real,

        cumplimiento_bajo,
        cumplimiento_alto,

        requiere_revision,

        estado_validacion,

        notas,

        generated_at
      )
      VALUES (
        @operation_id,

        @puesto_sap,
        @maquina,
        @proceso,

        @orden,
        @posicion,

        @codigo_material,
        @nombre_material,

        @fecha_desde,
        @fecha_hasta,

        @eventos,

        @plan,
        @real,

        @diferencia,
        @cumplimiento,

        @unidad,

        @horas,
        @desperdicio,

        @operadores,
        @turnos,

        @es_prueba,
        @sin_plan,
        @sin_real,

        @cumplimiento_bajo,
        @cumplimiento_alto,

        @requiere_revision,

        @estado_validacion,

        @notas,

        CURRENT_TIMESTAMP
      )
    `);

  const transaction =
    db.transaction(
      (
        rows:
          OperacionCandidate[]
      ) => {
        limpiar.run();

        for (
          const row of rows
        ) {
          insertar.run(
            row
          );
        }
      }
    );

  transaction(
    operaciones
  );
}

/* =========================================================
   MOSTRAR RESUMEN
========================================================= */

function mostrarResumen():
void {
  interface Resumen {
    proceso: string;
    maquina: string;

    operaciones: number;

    candidatas: number;
    revision: number;
    pendientes: number;

    plan: number;
    real: number;

    cumplimiento: number | null;
  }

  const rows =
    db
      .prepare(`
        SELECT
          proceso,
          maquina,

          COUNT(*) AS operaciones,

          SUM(
            CASE
              WHEN estado_validacion =
                   'CANDIDATO'
              THEN 1
              ELSE 0
            END
          ) AS candidatas,

          SUM(
            CASE
              WHEN requiere_revision = 1
              THEN 1
              ELSE 0
            END
          ) AS revision,

          SUM(
            CASE
              WHEN estado_validacion =
                   'PENDIENTE_REGLA'
              THEN 1
              ELSE 0
            END
          ) AS pendientes,

          SUM(
            CASE
              WHEN real IS NOT NULL
              THEN plan
              ELSE 0
            END
          ) AS plan,

          SUM(
            COALESCE(
              real,
              0
            )
          ) AS real,

          CASE
            WHEN SUM(
              CASE
                WHEN real IS NOT NULL
                THEN plan
                ELSE 0
              END
            ) > 0

            THEN (
              SUM(
                COALESCE(
                  real,
                  0
                )
              )
              /
              SUM(
                CASE
                  WHEN real IS NOT NULL
                  THEN plan
                  ELSE 0
                END
              )
            ) * 100

            ELSE NULL
          END AS cumplimiento

        FROM
          compliance_operations_candidate

        GROUP BY
          proceso,
          maquina

        ORDER BY
          proceso,
          maquina
      `)
      .all() as Resumen[];

  console.log(
    "\n" +
    "=".repeat(
      125
    )
  );

  console.log(
    "OPERACIONES DE CUMPLIMIENTO CANDIDATAS"
  );

  console.log(
    "=".repeat(
      125
    )
  );

  console.log(
    [
      "PROCESO".padEnd(
        15
      ),
      "MAQ".padEnd(
        7
      ),
      "OPS".padStart(
        6
      ),
      "OK".padStart(
        6
      ),
      "REV".padStart(
        6
      ),
      "PEND".padStart(
        6
      ),
      "PLAN".padStart(
        18
      ),
      "REAL".padStart(
        18
      ),
      "CUMP".padStart(
        10
      ),
    ].join(
      " | "
    )
  );

  console.log(
    "-".repeat(
      125
    )
  );

  for (
    const row of rows
  ) {
    const cumplimiento =
      row.cumplimiento ===
      null
        ? "-"
        : `${Number(
            row.cumplimiento
          ).toFixed(
            2
          )}%`;

    console.log(
      [
        row.proceso
          .padEnd(
            15
          ),

        row.maquina
          .padEnd(
            7
          ),

        String(
          row.operaciones
        )
          .padStart(
            6
          ),

        String(
          row.candidatas
        )
          .padStart(
            6
          ),

        String(
          row.revision
        )
          .padStart(
            6
          ),

        String(
          row.pendientes
        )
          .padStart(
            6
          ),

        Number(
          row.plan ?? 0
        )
          .toLocaleString(
            "en-US",
            {
              maximumFractionDigits:
                3,
            }
          )
          .padStart(
            18
          ),

        Number(
          row.real ?? 0
        )
          .toLocaleString(
            "en-US",
            {
              maximumFractionDigits:
                3,
            }
          )
          .padStart(
            18
          ),

        cumplimiento.padStart(
          10
        ),
      ].join(
        " | "
      )
    );
  }

  console.log(
    "=".repeat(
      125
    )
  );
}

/* =========================================================
   MOSTRAR ESTADOS
========================================================= */

function mostrarEstados():
void {
  interface Estado {
    estado_validacion: string;
    total: number;
  }

  const estados =
    db
      .prepare(`
        SELECT
          estado_validacion,
          COUNT(*) AS total

        FROM
          compliance_operations_candidate

        GROUP BY
          estado_validacion

        ORDER BY
          total DESC
      `)
      .all() as Estado[];

  console.log(
    "\nESTADOS DE VALIDACION"
  );

  console.log(
    "-".repeat(
      55
    )
  );

  for (
    const row of estados
  ) {
    console.log(
      `${row.estado_validacion.padEnd(
        28
      )} ${String(
        row.total
      ).padStart(
        8
      )}`
    );
  }
}

/* =========================================================
   MOSTRAR OPERACIONES A REVISAR
========================================================= */

function mostrarRevision():
void {
  interface Revision {
    puesto_sap: string;
    maquina: string;
    orden: string;

    codigo_material: string;

    plan: number;
    real: number | null;

    cumplimiento:
      number | null;

    estado_validacion:
      string;
  }

  const rows =
    db
      .prepare(`
        SELECT
          puesto_sap,
          maquina,
          orden,

          codigo_material,

          plan,
          real,

          cumplimiento,

          estado_validacion

        FROM
          compliance_operations_candidate

        WHERE
          requiere_revision = 1

        ORDER BY
          CASE
            estado_validacion

            WHEN 'EXCLUIR_PRUEBA'
            THEN 1

            WHEN 'REVISAR_SIN_PLAN'
            THEN 2

            WHEN 'REVISAR_SIN_REAL'
            THEN 3

            WHEN 'REVISAR_CUMP_ALTO'
            THEN 4

            WHEN 'REVISAR_CUMP_BAJO'
            THEN 5

            WHEN 'PENDIENTE_REGLA'
            THEN 6

            ELSE 99
          END,

          proceso,
          maquina,
          orden

        LIMIT 40
      `)
      .all() as Revision[];

  console.log(
    "\nMUESTRA DE OPERACIONES A REVISAR"
  );

  console.log(
    "-".repeat(
      110
    )
  );

  for (
    const row of rows
  ) {
    const cumplimiento =
      row.cumplimiento ===
      null
        ? "-"
        : `${Number(
            row.cumplimiento
          ).toFixed(
            2
          )}%`;

    console.log(
      [
        `${row.puesto_sap}/${row.maquina}`
          .padEnd(
            14
          ),

        `Orden ${row.orden}`
          .padEnd(
            18
          ),

        row.codigo_material
          .padEnd(
            12
          ),

        `Plan ${Number(
          row.plan
        ).toLocaleString(
          "en-US",
          {
            maximumFractionDigits:
              2,
          }
        )}`
          .padEnd(
            22
          ),

        `Real ${
          row.real === null
            ? "-"
            : Number(
                row.real
              ).toLocaleString(
                "en-US",
                {
                  maximumFractionDigits:
                    2,
                }
              )
        }`
          .padEnd(
            22
          ),

        cumplimiento
          .padEnd(
            10
          ),

        row.estado_validacion,
      ].join(
        " | "
      )
    );
  }
}

/* =========================================================
   MAIN
========================================================= */

function main():
void {
  logger.info(
    "=================================="
  );

  logger.info(
    "GENERANDO OPERACIONES CANDIDATAS"
  );

  logger.info(
    "=================================="
  );

  crearTabla();

  const fuente =
    obtenerOperaciones();

  logger.info(
    {
      operacionesFuente:
        fuente.length,
    },
    "Operaciones únicas obtenidas"
  );

  const operaciones =
    fuente.map(
      transformarOperacion
    );

  guardarOperaciones(
    operaciones
  );

  mostrarResumen();

  mostrarEstados();

  mostrarRevision();

  logger.info(
    {
      operaciones:
        operaciones.length,

      revision:
        operaciones.filter(
          (row) =>
            row.requiere_revision ===
            1
        ).length,

      candidatas:
        operaciones.filter(
          (row) =>
            row.estado_validacion ===
            "CANDIDATO"
        ).length,
    },
    "Capa candidata generada"
  );

  logger.info(
    "=================================="
  );

  logger.info(
    "OPERACIONES CANDIDATAS COMPLETADAS"
  );

  logger.info(
    "=================================="
  );
}

main();