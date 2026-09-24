import { db } from "./db.js";
import { logger } from "../utils/logger.js";

/* =========================================================
   MODELO ANALÍTICO V1

   Fuente inmutable:
     events

   Capa de negocio provisional:
     machine_mapping

   Vistas:
     v_operations_candidate
     v_confirmations_candidate
     v_compliance_candidate
     v_machine_compliance_candidate
========================================================= */

function crearVistas(): void {
  db.exec(`
    /* =====================================================
       LIMPIEZA DE VISTAS

       Las recreamos para permitir evolucionar el modelo
       sin tener que modificar manualmente SQLite.
    ===================================================== */

    DROP VIEW IF EXISTS
      v_machine_compliance_candidate;

    DROP VIEW IF EXISTS
      v_compliance_candidate;

    DROP VIEW IF EXISTS
      v_confirmations_candidate;

    DROP VIEW IF EXISTS
      v_operations_candidate;


    /* =====================================================
       1. OPERACIONES

       Una fila por:

       puesto SAP
       + orden
       + posición
       + material

       Aquí vive el PLAN.

       cantidad_operacion aparece repetida en SAP para
       distintas notificaciones, por lo que se toma
       UNA SOLA VEZ mediante MAX().
    ===================================================== */

    CREATE VIEW
      v_operations_candidate
    AS

    SELECT
      (
        e.puesto_trabajo
        || '|'
        || e.orden
        || '|'
        || COALESCE(
             CAST(
               e.posicion AS TEXT
             ),
             ''
           )
        || '|'
        || e.codigo_material
      ) AS operation_key,

      e.puesto_trabajo
        AS puesto_sap,

      mm.maquina
        AS maquina,

      mm.proceso
        AS proceso,

      e.orden
        AS orden,

      e.posicion
        AS posicion,

      e.codigo_material
        AS codigo_material,

      MAX(
        e.nombre_material
      ) AS nombre_material,

      MIN(
        e.fecha_reporte
      ) AS fecha_inicio,

      MAX(
        e.fecha_reporte
      ) AS fecha_fin,

      COUNT(*)
        AS eventos,

      MAX(
        COALESCE(
          e.cantidad_operacion,
          0
        )
      ) AS plan,

      MAX(
        NULLIF(
          e.unidad_operacion,
          ''
        )
      ) AS unidad_plan,

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
        COALESCE(
          e.cantidad_notificada,
          0
        )
      ) AS cantidad_notificada_total,

      SUM(
        COALESCE(
          e.cantidad_metros,
          0
        )
      ) AS metros_total,

      CASE
        WHEN
          e.codigo_material = '10249848'

          OR UPPER(
            MAX(
              COALESCE(
                e.nombre_material,
                ''
              )
            )
          ) LIKE '%PRUEBA%'

        THEN 1
        ELSE 0
      END AS es_prueba,

      CASE
        WHEN
          MAX(
            COALESCE(
              e.cantidad_operacion,
              0
            )
          ) <= 0

        THEN 1
        ELSE 0
      END AS sin_plan,

      CASE
        WHEN
          SUM(
            COALESCE(
              e.cantidad_metros,
              0
            )
          ) <= 0

        THEN 1
        ELSE 0
      END AS sin_metros

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
      e.codigo_material;


    /* =====================================================
       2. NOTIFICACIONES / CONFIRMACIONES

       Una fila por EVENTO SAP.

       Aquí vive lo que realmente ocurrió:

       - producción en metros
       - cantidad notificada
       - horas
       - desperdicio
       - operador
       - turno
       - fecha

       Esta granularidad será fundamental para filtros
       diarios, operadores, turnos y desperdicio.
    ===================================================== */

    CREATE VIEW
      v_confirmations_candidate
    AS

    SELECT
      e.event_id
        AS event_id,

      (
        e.puesto_trabajo
        || '|'
        || e.orden
        || '|'
        || COALESCE(
             CAST(
               e.posicion AS TEXT
             ),
             ''
           )
        || '|'
        || e.codigo_material
      ) AS operation_key,

      e.fecha_reporte
        AS fecha,

      e.puesto_trabajo
        AS puesto_sap,

      mm.maquina
        AS maquina,

      mm.proceso
        AS proceso,

      e.orden
        AS orden,

      e.posicion
        AS posicion,

      e.codigo_material
        AS codigo_material,

      e.nombre_material
        AS nombre_material,

      e.operador
        AS operador,

      e.turno
        AS turno,

      COALESCE(
        e.cantidad_metros,
        0
      ) AS real_metros,

      NULLIF(
        e.unidad_metros,
        ''
      ) AS unidad_metros,

      COALESCE(
        e.cantidad_notificada,
        0
      ) AS cantidad_notificada,

      NULLIF(
        e.unidad_notificada,
        ''
      ) AS unidad_notificada,

      COALESCE(
        e.horas,
        0
      ) AS horas,

      COALESCE(
        e.desperdicio,
        0
      ) AS desperdicio,

      NULLIF(
        e.unidad_desperdicio,
        ''
      ) AS unidad_desperdicio

    FROM events e

    INNER JOIN machine_mapping mm
      ON mm.puesto_sap =
         e.puesto_trabajo;


    /* =====================================================
       3. CUMPLIMIENTO POR OPERACIÓN

       SOLO calculamos automáticamente los puestos donde
       estamos validando:

       PLAN = cantidad_operacion
       REAL = SUM(cantidad_metros)

       Bolsera queda expresamente sin fórmula.
    ===================================================== */

    CREATE VIEW
      v_compliance_candidate
    AS

    SELECT
      op.*,

      CASE
        WHEN op.puesto_sap IN (
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

        THEN op.metros_total

        ELSE NULL
      END AS real,

      CASE
        WHEN
          op.puesto_sap IN (
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

          AND op.plan > 0

        THEN
          op.metros_total
          -
          op.plan

        ELSE NULL
      END AS diferencia,

      CASE
        WHEN
          op.puesto_sap IN (
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

          AND op.plan > 0

        THEN
          (
            op.metros_total
            /
            op.plan
          ) * 100

        ELSE NULL
      END AS cumplimiento,

      CASE
        WHEN op.es_prueba = 1
        THEN 'EXCLUIR_PRUEBA'

        WHEN op.plan <= 0
        THEN 'SIN_PLAN'

        WHEN op.puesto_sap IN (
          '476P',
          '478P'
        )
        THEN 'PENDIENTE_REGLA'

        WHEN
          op.metros_total <= 0
        THEN 'SIN_REAL'

        WHEN
          (
            op.metros_total
            /
            op.plan
          ) * 100 < 50
        THEN 'REVISION_BAJO'

        WHEN
          (
            op.metros_total
            /
            op.plan
          ) * 100 > 130
        THEN 'REVISION_ALTO'

        ELSE 'CANDIDATO'
      END AS estado

    FROM
      v_operations_candidate op;


    /* =====================================================
       4. RESUMEN POR PUESTO / MÁQUINA

       Importante:

       todavía mantenemos puesto_sap en el GROUP BY.

       Así 447SB y 447SL NO se mezclan accidentalmente
       aunque ambas tengan maquina = 447.
    ===================================================== */

    CREATE VIEW
      v_machine_compliance_candidate
    AS

    SELECT
      proceso,
      maquina,
      puesto_sap,

      COUNT(*)
        AS operaciones,

      SUM(
        CASE
          WHEN estado = 'CANDIDATO'
          THEN 1
          ELSE 0
        END
      ) AS operaciones_candidatas,

      SUM(
        CASE
          WHEN estado IN (
            'REVISION_BAJO',
            'REVISION_ALTO',
            'SIN_REAL',
            'SIN_PLAN'
          )
          THEN 1
          ELSE 0
        END
      ) AS operaciones_revision,

      SUM(
        CASE
          WHEN real IS NOT NULL
          THEN plan
          ELSE 0
        END
      ) AS plan_total,

      SUM(
        COALESCE(
          real,
          0
        )
      ) AS real_total,

      CASE
        WHEN
          SUM(
            CASE
              WHEN real IS NOT NULL
              THEN plan
              ELSE 0
            END
          ) > 0

        THEN
          (
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
      v_compliance_candidate

    WHERE
      es_prueba = 0

    GROUP BY
      proceso,
      maquina,
      puesto_sap;
  `);
}

/* =========================================================
   MOSTRAR OPERACIONES
========================================================= */

function mostrarOperaciones(): void {
  interface Row {
    proceso: string;
    maquina: string;
    puesto_sap: string;

    operaciones: number;
    operaciones_candidatas: number;
    operaciones_revision: number;

    plan_total: number;
    real_total: number;
    cumplimiento: number | null;
  }

  const rows =
    db.prepare(`
      SELECT *
      FROM v_machine_compliance_candidate

      ORDER BY
        proceso,
        maquina,
        puesto_sap
    `)
    .all() as Row[];

  console.log(
    "\n" +
    "=".repeat(125)
  );

  console.log(
    "MODELO ANALITICO DE PRODUCCION"
  );

  console.log(
    "=".repeat(125)
  );

  console.log(
    [
      "PROCESO".padEnd(15),
      "MAQ".padEnd(7),
      "PUESTO".padEnd(9),

      "OPS".padStart(6),
      "OK".padStart(6),
      "REV".padStart(6),

      "PLAN".padStart(18),
      "REAL".padStart(18),
      "CUMP".padStart(10),
    ].join(" | ")
  );

  console.log(
    "-".repeat(125)
  );

  for (const row of rows) {
    const cumplimiento =
      row.cumplimiento === null
        ? "-"
        : `${Number(
            row.cumplimiento
          ).toFixed(2)}%`;

    console.log(
      [
        row.proceso
          .padEnd(15),

        row.maquina
          .padEnd(7),

        row.puesto_sap
          .padEnd(9),

        String(
          row.operaciones
        ).padStart(6),

        String(
          row.operaciones_candidatas
        ).padStart(6),

        String(
          row.operaciones_revision
        ).padStart(6),

        Number(
          row.plan_total ?? 0
        )
          .toLocaleString(
            "en-US",
            {
              maximumFractionDigits: 3,
            }
          )
          .padStart(18),

        Number(
          row.real_total ?? 0
        )
          .toLocaleString(
            "en-US",
            {
              maximumFractionDigits: 3,
            }
          )
          .padStart(18),

        cumplimiento
          .padStart(10),
      ].join(" | ")
    );
  }

  console.log(
    "=".repeat(125)
  );
}

/* =========================================================
   MOSTRAR CONTEOS DE GRANULARIDAD
========================================================= */

function mostrarGranularidad(): void {
  const operaciones =
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM v_operations_candidate
    `)
    .get() as {
      total: number;
    };

  const confirmaciones =
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM v_confirmations_candidate
    `)
    .get() as {
      total: number;
    };

  const fuente =
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM events
      WHERE puesto_trabajo IN (
        SELECT puesto_sap
        FROM machine_mapping
      )
    `)
    .get() as {
      total: number;
    };

  console.log(
    "\nGRANULARIDAD"
  );

  console.log(
    "-".repeat(55)
  );

  console.log(
    `Eventos SAP mapeados:       ${fuente.total}`
  );

  console.log(
    `Confirmaciones analíticas:  ${confirmaciones.total}`
  );

  console.log(
    `Operaciones únicas:         ${operaciones.total}`
  );

  console.log(
    ""
  );

  console.log(
    "events = v_confirmations_candidate debe mantenerse 1:1"
  );

  console.log(
    "v_operations_candidate contiene el Plan una sola vez."
  );
}

/* =========================================================
   VALIDACIÓN AUTOMÁTICA
========================================================= */

function validarModelo(): void {
  const original =
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM events
      WHERE puesto_trabajo IN (
        SELECT puesto_sap
        FROM machine_mapping
      )
    `)
    .get() as {
      total: number;
    };

  const confirmaciones =
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM v_confirmations_candidate
    `)
    .get() as {
      total: number;
    };

  if (
    original.total !==
    confirmaciones.total
  ) {
    throw new Error(
      [
        "La granularidad de confirmaciones no coincide.",
        `events=${original.total}`,
        `confirmaciones=${confirmaciones.total}`,
      ].join(" ")
    );
  }

  const duplicados =
    db.prepare(`
      SELECT
        event_id,
        COUNT(*) AS total

      FROM
        v_confirmations_candidate

      GROUP BY
        event_id

      HAVING
        COUNT(*) > 1

      LIMIT 1
    `)
    .get();

  if (duplicados) {
    throw new Error(
      "Se detectaron event_id duplicados en v_confirmations_candidate."
    );
  }

  logger.info(
    {
      eventos:
        original.total,
    },
    "Granularidad de confirmaciones validada 1:1"
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
    "CREANDO MODELO ANALITICO"
  );

  logger.info(
    "=================================="
  );

  crearVistas();

  validarModelo();

  mostrarGranularidad();

  mostrarOperaciones();

  logger.info(
    "=================================="
  );

  logger.info(
    "MODELO ANALITICO COMPLETADO"
  );

  logger.info(
    "=================================="
  );
}

main();