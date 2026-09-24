import { db } from "./db.js";
import { logger } from "../utils/logger.js";

/* =========================================================
   MODELO DIARIO SAP PRINCIPAL

   Lógica histórica:
   1. NO deduplicar órdenes.
   2. Sumar fila por fila.
   3. Excluir Cod. Mat. 10249848.
   4. Ignorar puestos no activos.
   5. Agrupar por:
      fecha + máquina + sección
========================================================= */

function crearVistas(): void {
  db.exec(`
    DROP VIEW IF EXISTS
      v_daily_compliance;

    DROP VIEW IF EXISTS
      v_sap_principal_rows;

    DROP VIEW IF EXISTS
      v_sap_ignored_workcenters;


    /* =====================================================
       1. FILAS VALIDAS SAP PRINCIPAL
    ===================================================== */

    CREATE VIEW
      v_sap_principal_rows
    AS

    SELECT
      e.event_id,

      e.fecha_reporte AS fecha,

      CAST(
        substr(
          e.fecha_reporte,
          1,
          4
        ) AS INTEGER
      ) AS anio,

      CAST(
        substr(
          e.fecha_reporte,
          6,
          2
        ) AS INTEGER
      ) AS mes,

      CAST(
        substr(
          e.fecha_reporte,
          9,
          2
        ) AS INTEGER
      ) AS dia,

      e.puesto_trabajo
        AS puesto_sap,

      mm.maquina,

      mm.proceso
        AS seccion,

      e.orden,
      e.operador,
      e.turno,

      e.codigo_material,
      e.nombre_material,

      CASE
        WHEN mm.campo_plan =
             'cantidad_operacion'
        THEN COALESCE(
          e.cantidad_operacion,
          0
        )

        WHEN mm.campo_plan =
             'cantidad_notificada'
        THEN COALESCE(
          e.cantidad_notificada,
          0
        )

        WHEN mm.campo_plan =
             'cantidad_metros'
        THEN COALESCE(
          e.cantidad_metros,
          0
        )

        ELSE 0
      END AS plan,

      CASE
        WHEN mm.campo_real =
             'cantidad_metros'
        THEN COALESCE(
          e.cantidad_metros,
          0
        )

        WHEN mm.campo_real =
             'cantidad_notificada'
        THEN COALESCE(
          e.cantidad_notificada,
          0
        )

        WHEN mm.campo_real =
             'cantidad_operacion'
        THEN COALESCE(
          e.cantidad_operacion,
          0
        )

        ELSE 0
      END AS real,

      COALESCE(
        e.desperdicio,
        0
      ) AS desperdicio,

      COALESCE(
        e.horas,
        0
      ) AS horas,

      mm.unidad

    FROM events e

    INNER JOIN machine_mapping mm
      ON mm.puesto_sap =
         e.puesto_trabajo

      AND mm.activo = 1

    WHERE
      e.codigo_material <>
      '10249848';


    /* =====================================================
       2. CUMPLIMIENTO DIARIO
    ===================================================== */

    CREATE VIEW
      v_daily_compliance
    AS

    SELECT
      fecha,
      anio,
      mes,
      dia,

      maquina,
      seccion,

      SUM(
        plan
      ) AS plan,

      SUM(
        real
      ) AS real,

      SUM(
        real
      )
      -
      SUM(
        plan
      ) AS diferencia,

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
      END AS cumplimiento,

      SUM(
        desperdicio
      ) AS desperdicio,

      SUM(
        horas
      ) AS horas,

      COUNT(*)
        AS registros_sap,

      COUNT(
        DISTINCT orden
      ) AS ordenes,

      GROUP_CONCAT(
        DISTINCT puesto_sap
      ) AS puestos_sap,

      GROUP_CONCAT(
        DISTINCT operador
      ) AS operadores,

      GROUP_CONCAT(
        DISTINCT turno
      ) AS turnos

    FROM
      v_sap_principal_rows

    GROUP BY
      fecha,
      anio,
      mes,
      dia,
      maquina,
      seccion;


    /* =====================================================
       3. PUESTOS IGNORADOS
    ===================================================== */

    CREATE VIEW
      v_sap_ignored_workcenters
    AS

    SELECT
      e.puesto_trabajo
        AS puesto_sap,

      CASE
        WHEN mm.puesto_sap IS NULL
        THEN 'NO_CONFIGURADO'

        WHEN mm.activo = 0
        THEN 'NO_INCLUIDO'

        ELSE 'OTRO'
      END AS motivo,

      COUNT(*)
        AS registros,

      MIN(
        e.fecha_reporte
      ) AS fecha_desde,

      MAX(
        e.fecha_reporte
      ) AS fecha_hasta

    FROM events e

    LEFT JOIN machine_mapping mm
      ON mm.puesto_sap =
         e.puesto_trabajo

    WHERE
      mm.puesto_sap IS NULL
      OR mm.activo = 0

    GROUP BY
      e.puesto_trabajo,

      CASE
        WHEN mm.puesto_sap IS NULL
        THEN 'NO_CONFIGURADO'

        WHEN mm.activo = 0
        THEN 'NO_INCLUIDO'

        ELSE 'OTRO'
      END;
  `);
}

/* =========================================================
   VALIDACIONES
========================================================= */

function validarExclusionPrueba(): void {
  const prueba =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM
        v_sap_principal_rows

      WHERE
        codigo_material =
        '10249848'
    `)
    .get() as {
      total: number;
    };

  if (prueba.total !== 0) {
    throw new Error(
      "La exclusion del material 10249848 fallo."
    );
  }
}

function validarBolsera(): void {
  const bolsera =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM
        v_daily_compliance

      WHERE
        seccion = 'BOLSERA'
    `)
    .get() as {
      total: number;
    };

  if (bolsera.total !== 0) {
    throw new Error(
      "Bolsera aparecio en SAP principal."
    );
  }
}

/* =========================================================
   RESUMEN GENERAL
========================================================= */

function mostrarResumen(): void {
  interface Resumen {
    seccion: string;
    maquina: string;

    dias: number;
    registros_sap: number;

    plan: number;
    real: number;

    desperdicio: number;
    horas: number;

    cumplimiento: number | null;
  }

  const rows =
    db.prepare(`
      SELECT
        seccion,
        maquina,

        COUNT(*) AS dias,

        SUM(
          registros_sap
        ) AS registros_sap,

        SUM(
          plan
        ) AS plan,

        SUM(
          real
        ) AS real,

        SUM(
          desperdicio
        ) AS desperdicio,

        SUM(
          horas
        ) AS horas,

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
        END AS cumplimiento

      FROM
        v_daily_compliance

      GROUP BY
        seccion,
        maquina

      ORDER BY
        seccion,
        maquina
    `)
    .all() as Resumen[];

  console.log(
    "\n" +
    "=".repeat(135)
  );

  console.log(
    "CUMPLIMIENTO DIARIO - LOGICA HISTORICA SAP PRINCIPAL"
  );

  console.log(
    "=".repeat(135)
  );

  console.log(
    [
      "SECCION".padEnd(15),
      "MAQ".padEnd(7),
      "DIAS".padStart(6),
      "FILAS".padStart(8),
      "PLAN".padStart(18),
      "REAL".padStart(18),
      "DESP".padStart(14),
      "HORAS".padStart(12),
      "CUMP".padStart(10),
    ].join(" | ")
  );

  console.log(
    "-".repeat(135)
  );

  for (const row of rows) {
    const cumplimiento =
      row.cumplimiento === null
        ? "-"
        : `${
            (
              Number(
                row.cumplimiento
              ) *
              100
            ).toFixed(2)
          }%`;

    console.log(
      [
        row.seccion
          .padEnd(15),

        row.maquina
          .padEnd(7),

        String(
          row.dias
        ).padStart(6),

        String(
          row.registros_sap
        ).padStart(8),

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
          .padStart(18),

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
          .padStart(18),

        Number(
          row.desperdicio ?? 0
        )
          .toLocaleString(
            "en-US",
            {
              maximumFractionDigits:
                3,
            }
          )
          .padStart(14),

        Number(
          row.horas ?? 0
        )
          .toLocaleString(
            "en-US",
            {
              maximumFractionDigits:
                2,
            }
          )
          .padStart(12),

        cumplimiento
          .padStart(10),
      ].join(" | ")
    );
  }

  console.log(
    "=".repeat(135)
  );
}

/* =========================================================
   MUESTRA DIARIA
========================================================= */

function mostrarUltimosDias(): void {
  interface Diario {
    fecha: string;
    seccion: string;
    maquina: string;

    plan: number;
    real: number;

    cumplimiento: number | null;

    desperdicio: number;
    horas: number;

    registros_sap: number;
    ordenes: number;

    puestos_sap: string;
  }

  const rows =
    db.prepare(`
      SELECT
        fecha,
        seccion,
        maquina,

        plan,
        real,
        cumplimiento,

        desperdicio,
        horas,

        registros_sap,
        ordenes,

        puestos_sap

      FROM
        v_daily_compliance

      ORDER BY
        fecha DESC,
        seccion,
        maquina

      LIMIT 50
    `)
    .all() as Diario[];

  console.log(
    "\nMUESTRA DIARIA"
  );

  console.log(
    "-".repeat(145)
  );

  console.log(
    [
      "FECHA".padEnd(12),
      "SECCION".padEnd(14),
      "MAQ".padEnd(6),
      "PLAN".padStart(16),
      "REAL".padStart(16),
      "CUMP".padStart(10),
      "DESP".padStart(12),
      "HORAS".padStart(10),
      "FILAS".padStart(7),
      "ORD".padStart(5),
      "PUESTOS",
    ].join(" | ")
  );

  console.log(
    "-".repeat(145)
  );

  for (const row of rows) {
    const cumplimiento =
      row.cumplimiento === null
        ? "-"
        : `${
            (
              Number(
                row.cumplimiento
              ) *
              100
            ).toFixed(2)
          }%`;

    console.log(
      [
        row.fecha
          .padEnd(12),

        row.seccion
          .padEnd(14),

        row.maquina
          .padEnd(6),

        Number(
          row.plan
        )
          .toLocaleString(
            "en-US",
            {
              maximumFractionDigits:
                3,
            }
          )
          .padStart(16),

        Number(
          row.real
        )
          .toLocaleString(
            "en-US",
            {
              maximumFractionDigits:
                3,
            }
          )
          .padStart(16),

        cumplimiento
          .padStart(10),

        Number(
          row.desperdicio
        )
          .toLocaleString(
            "en-US",
            {
              maximumFractionDigits:
                3,
            }
          )
          .padStart(12),

        Number(
          row.horas
        )
          .toLocaleString(
            "en-US",
            {
              maximumFractionDigits:
                2,
            }
          )
          .padStart(10),

        String(
          row.registros_sap
        ).padStart(7),

        String(
          row.ordenes
        ).padStart(5),

        row.puestos_sap,
      ].join(" | ")
    );
  }

  console.log(
    "-".repeat(145)
  );
}

/* =========================================================
   PUESTOS IGNORADOS
========================================================= */

function mostrarIgnorados(): void {
  interface Ignorado {
    puesto_sap: string;
    motivo: string;

    registros: number;

    fecha_desde: string;
    fecha_hasta: string;
  }

  const rows =
    db.prepare(`
      SELECT
        puesto_sap,
        motivo,
        registros,
        fecha_desde,
        fecha_hasta

      FROM
        v_sap_ignored_workcenters

      ORDER BY
        registros DESC,
        puesto_sap
    `)
    .all() as Ignorado[];

  console.log(
    "\nPUESTOS IGNORADOS"
  );

  console.log(
    "-".repeat(85)
  );

  if (rows.length === 0) {
    console.log(
      "No existen puestos ignorados."
    );

    return;
  }

  for (const row of rows) {
    console.log(
      [
        row.puesto_sap
          .padEnd(10),

        row.motivo
          .padEnd(16),

        String(
          row.registros
        ).padStart(6),

        `${row.fecha_desde} -> ${row.fecha_hasta}`,
      ].join(" | ")
    );
  }
}

/* =========================================================
   ORDENES DE PRUEBA EXCLUIDAS
========================================================= */

function mostrarPruebasExcluidas(): void {
  const row =
    db.prepare(`
      SELECT
        COUNT(*) AS registros,

        SUM(
          COALESCE(
            cantidad_operacion,
            0
          )
        ) AS plan_excluido,

        SUM(
          COALESCE(
            cantidad_metros,
            0
          )
        ) AS metros_excluidos,

        SUM(
          COALESCE(
            desperdicio,
            0
          )
        ) AS desperdicio_excluido,

        SUM(
          COALESCE(
            horas,
            0
          )
        ) AS horas_excluidas

      FROM events

      WHERE
        codigo_material =
        '10249848'
    `)
    .get() as {
      registros: number;

      plan_excluido: number;
      metros_excluidos: number;

      desperdicio_excluido: number;
      horas_excluidas: number;
    };

  console.log(
    "\nORDENES DE PRUEBA EXCLUIDAS"
  );

  console.log(
    "-".repeat(55)
  );

  console.log(
    `Filas excluidas:       ${row.registros}`
  );

  console.log(
    `Plan no sumado:        ${Number(
      row.plan_excluido ?? 0
    ).toLocaleString("en-US")}`
  );

  console.log(
    `Real no sumado:        ${Number(
      row.metros_excluidos ?? 0
    ).toLocaleString("en-US")}`
  );

  console.log(
    `Desperdicio no sumado: ${Number(
      row.desperdicio_excluido ?? 0
    ).toLocaleString("en-US")}`
  );

  console.log(
    `Horas no sumadas:      ${Number(
      row.horas_excluidas ?? 0
    ).toLocaleString("en-US")}`
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
    "GENERANDO CUMPLIMIENTO DIARIO"
  );

  logger.info(
    "=================================="
  );

  crearVistas();

  validarExclusionPrueba();

  validarBolsera();

  mostrarResumen();

  mostrarUltimosDias();

  mostrarIgnorados();

  mostrarPruebasExcluidas();

  logger.info(
    "=================================="
  );

  logger.info(
    "CUMPLIMIENTO DIARIO COMPLETADO"
  );

  logger.info(
    "=================================="
  );
}

main();