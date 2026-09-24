import {
  db,
} from "./db.js";

/* =========================================================
   VISTAS SEMÁNTICAS DE CUMPLIMIENTO

   Fuentes integradas:
   - SAP_PRINCIPAL  -> v_daily_compliance
   - DRIVE_BOLSERA  -> v_bolsera_daily

   Objetivo:
   que el generador Excel consuma una sola vista:
   v_cumplimiento_diario

   y que a partir de ella se construyan:
   - v_cumplimiento_semanal
   - v_cumplimiento_mensual
   - v_cumplimiento_anual
   - v_cumplimiento_mensual_seccion
========================================================= */

function main():
void {
  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "CONSTRUCCIÓN DE VISTAS DE CUMPLIMIENTO"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  /* =======================================================
     VALIDAR FUENTES
  ======================================================= */

  const objetos =
    db.prepare(`
      SELECT
        name,
        type

      FROM
        sqlite_master

      WHERE
        name IN (
          'v_daily_compliance',
          'v_bolsera_daily'
        )

      ORDER BY
        name
    `)
      .all() as Array<{
        name: string;
        type: string;
      }>;

  const nombres =
    new Set(
      objetos.map(
        (
          row
        ) =>
          row.name
      )
    );

  if (
    !nombres.has(
      "v_daily_compliance"
    )
  ) {
    throw new Error(
      [
        "No existe v_daily_compliance.",
        "Primero ejecuta la construcción de la capa SAP principal.",
      ].join(
        "\n"
      )
    );
  }

  if (
    !nombres.has(
      "v_bolsera_daily"
    )
  ) {
    throw new Error(
      [
        "No existe v_bolsera_daily.",
        "Primero ejecuta:",
        "npm run bolsera:importar -- --archivo=\"...\" --periodo=AAAA-MM",
      ].join(
        "\n"
      )
    );
  }

  console.log(
    "✓ Fuente SAP principal disponible."
  );

  console.log(
    "✓ Fuente DRIVE_BOLSERA disponible."
  );

  /* =======================================================
     RECREAR VISTAS
  ======================================================= */

  db.exec(`
    DROP VIEW IF EXISTS
      v_cumplimiento_mensual_seccion;

    DROP VIEW IF EXISTS
      v_cumplimiento_anual;

    DROP VIEW IF EXISTS
      v_cumplimiento_mensual;

    DROP VIEW IF EXISTS
      v_cumplimiento_semanal;

    DROP VIEW IF EXISTS
      v_cumplimiento_diario;

    /* =====================================================
       DIARIO

       SAP:
       viene ya agregado por fecha + máquina + sección.

       BOLSERA:
       viene desde su archivo mensual independiente.

       UNION ALL es intencional:
       las máquinas de Bolsera NO deben existir en
       SAP_PRINCIPAL.
    ===================================================== */

    CREATE VIEW
      v_cumplimiento_diario
    AS

    SELECT
      'SAP_PRINCIPAL'
        AS fuente,

      fecha,

      CAST(
        substr(
          fecha,
          1,
          4
        )
        AS INTEGER
      )
        AS anio,

      CAST(
        substr(
          fecha,
          6,
          2
        )
        AS INTEGER
      )
        AS mes,

      CAST(
        substr(
          fecha,
          9,
          2
        )
        AS INTEGER
      )
        AS dia,

      CAST(
        maquina
        AS TEXT
      )
        AS maquina,

      seccion,

      CAST(
        plan
        AS REAL
      )
        AS plan,

      CAST(
        real
        AS REAL
      )
        AS real,

      CAST(
        diferencia
        AS REAL
      )
        AS diferencia,

      CASE
        WHEN plan > 0
          THEN real * 1.0 / plan
        ELSE NULL
      END
        AS cumplimiento,

      CAST(
        COALESCE(
          desperdicio,
          0
        )
        AS REAL
      )
        AS desperdicio,

      CAST(
        COALESCE(
          horas,
          0
        )
        AS REAL
      )
        AS horas

    FROM
      v_daily_compliance

    UNION ALL

    SELECT
      fuente,

      fecha,
      anio,
      mes,
      dia,

      CAST(
        maquina
        AS TEXT
      )
        AS maquina,

      seccion,

      CAST(
        plan
        AS REAL
      )
        AS plan,

      CAST(
        real
        AS REAL
      )
        AS real,

      CAST(
        diferencia
        AS REAL
      )
        AS diferencia,

      cumplimiento,

      CAST(
        COALESCE(
          desperdicio,
          0
        )
        AS REAL
      )
        AS desperdicio,

      CAST(
        COALESCE(
          horas,
          0
        )
        AS REAL
      )
        AS horas

    FROM
      v_bolsera_daily;

    /* =====================================================
       SEMANAL

       semana = ISO aproximada compatible con el formato
       actual S36, S37, S38 para septiembre 2026.

       semana_inicio = lunes
       semana_fin    = domingo
    ===================================================== */

    CREATE VIEW
      v_cumplimiento_semanal
    AS

    SELECT
      anio,

      CAST(
        strftime(
          '%W',
          fecha
        )
        AS INTEGER
      ) + 1
        AS semana,

      date(
        fecha,
        '-' ||
        (
          (
            CAST(
              strftime(
                '%w',
                fecha
              )
              AS INTEGER
            ) +
            6
          ) % 7
        ) ||
        ' days'
      )
        AS semana_inicio,

      date(
        fecha,
        '-' ||
        (
          (
            CAST(
              strftime(
                '%w',
                fecha
              )
              AS INTEGER
            ) +
            6
          ) % 7
        ) ||
        ' days',
        '+6 days'
      )
        AS semana_fin,

      maquina,
      seccion,

      SUM(
        plan
      )
        AS plan,

      SUM(
        real
      )
        AS real,

      SUM(
        real
      ) -
      SUM(
        plan
      )
        AS diferencia,

      CASE
        WHEN SUM(
          plan
        ) > 0
          THEN
            SUM(
              real
            ) * 1.0 /
            SUM(
              plan
            )
        ELSE NULL
      END
        AS cumplimiento,

      SUM(
        desperdicio
      )
        AS desperdicio,

      SUM(
        horas
      )
        AS horas,

      COUNT(*)
        AS dias_con_datos

    FROM
      v_cumplimiento_diario

    GROUP BY
      anio,
      semana,
      semana_inicio,
      semana_fin,
      maquina,
      seccion;

    /* =====================================================
       MENSUAL
    ===================================================== */

    CREATE VIEW
      v_cumplimiento_mensual
    AS

    SELECT
      anio,
      mes,

      maquina,
      seccion,

      SUM(
        plan
      )
        AS plan,

      SUM(
        real
      )
        AS real,

      SUM(
        real
      ) -
      SUM(
        plan
      )
        AS diferencia,

      CASE
        WHEN SUM(
          plan
        ) > 0
          THEN
            SUM(
              real
            ) * 1.0 /
            SUM(
              plan
            )
        ELSE NULL
      END
        AS cumplimiento,

      SUM(
        desperdicio
      )
        AS desperdicio,

      SUM(
        horas
      )
        AS horas,

      COUNT(*)
        AS dias_con_datos

    FROM
      v_cumplimiento_diario

    GROUP BY
      anio,
      mes,
      maquina,
      seccion;

    /* =====================================================
       MENSUAL POR SECCIÓN
    ===================================================== */

    CREATE VIEW
      v_cumplimiento_mensual_seccion
    AS

    SELECT
      anio,
      mes,
      seccion,

      SUM(
        plan
      )
        AS plan,

      SUM(
        real
      )
        AS real,

      SUM(
        real
      ) -
      SUM(
        plan
      )
        AS diferencia,

      CASE
        WHEN SUM(
          plan
        ) > 0
          THEN
            SUM(
              real
            ) * 1.0 /
            SUM(
              plan
            )
        ELSE NULL
      END
        AS cumplimiento,

      SUM(
        desperdicio
      )
        AS desperdicio,

      SUM(
        horas
      )
        AS horas,

      COUNT(
        DISTINCT maquina
      )
        AS maquinas,

      COUNT(*)
        AS dias_maquina

    FROM
      v_cumplimiento_diario

    GROUP BY
      anio,
      mes,
      seccion;

    /* =====================================================
       ANUAL
    ===================================================== */

    CREATE VIEW
      v_cumplimiento_anual
    AS

    SELECT
      anio,

      maquina,
      seccion,

      SUM(
        plan
      )
        AS plan,

      SUM(
        real
      )
        AS real,

      SUM(
        real
      ) -
      SUM(
        plan
      )
        AS diferencia,

      CASE
        WHEN SUM(
          plan
        ) > 0
          THEN
            SUM(
              real
            ) * 1.0 /
            SUM(
              plan
            )
        ELSE NULL
      END
        AS cumplimiento,

      SUM(
        desperdicio
      )
        AS desperdicio,

      SUM(
        horas
      )
        AS horas,

      COUNT(*)
        AS dias_maquina

    FROM
      v_cumplimiento_diario

    GROUP BY
      anio,
      maquina,
      seccion;
  `);

  console.log(
    "\n✓ Vistas recreadas."
  );

  /* =======================================================
     VALIDACIÓN
  ======================================================= */

  const diario =
    db.prepare(`
      SELECT
        COUNT(*) AS filas,
        COUNT(
          DISTINCT fecha
        ) AS dias,
        COUNT(
          DISTINCT maquina
        ) AS maquinas,
        COUNT(
          DISTINCT seccion
        ) AS secciones,

        MIN(
          fecha
        ) AS desde,

        MAX(
          fecha
        ) AS hasta,

        SUM(
          plan
        ) AS plan,

        SUM(
          real
        ) AS real

      FROM
        v_cumplimiento_diario
    `)
      .get() as {
        filas: number;
        dias: number;
        maquinas: number;
        secciones: number;
        desde: string | null;
        hasta: string | null;
        plan: number | null;
        real: number | null;
      };

  console.log(
    "\nResumen global:"
  );

  console.log(
    `Filas:       ${diario.filas}`
  );

  console.log(
    `Días:        ${diario.dias}`
  );

  console.log(
    `Máquinas:    ${diario.maquinas}`
  );

  console.log(
    `Secciones:   ${diario.secciones}`
  );

  console.log(
    `Periodo:     ${diario.desde} -> ${diario.hasta}`
  );

  console.log(
    `Plan:        ${Number(
      diario.plan ??
      0
    ).toFixed(
      3
    )}`
  );

  console.log(
    `Real:        ${Number(
      diario.real ??
      0
    ).toFixed(
      3
    )}`
  );

  const bolsera =
    db.prepare(`
      SELECT
        maquina,
        COUNT(*) AS dias,
        SUM(plan) AS plan,
        SUM(real) AS real,

        CASE
          WHEN SUM(plan) > 0
            THEN SUM(real) * 1.0 / SUM(plan)
          ELSE NULL
        END AS cumplimiento

      FROM
        v_cumplimiento_diario

      WHERE
        seccion = 'BOLSERA'

      GROUP BY
        maquina

      ORDER BY
        maquina
    `)
      .all() as Array<{
        maquina: string;
        dias: number;
        plan: number;
        real: number;
        cumplimiento: number | null;
      }>;

  console.log(
    "\nBOLSERA integrada:"
  );

  if (
    bolsera.length ===
    0
  ) {
    console.log(
      "⚠ No hay datos de BOLSERA."
    );
  } else {
    for (
      const row of
        bolsera
    ) {
      const cump =
        row.cumplimiento ===
        null
          ? "N/A"
          : `${(
              row.cumplimiento *
              100
            ).toFixed(
              2
            )}%`;

      console.log(
        [
          row.maquina.padEnd(
            8
          ),

          `Días=${String(
            row.dias
          ).padStart(
            2
          )}`,

          `Plan=${Number(
            row.plan
          ).toFixed(
            3
          ).padStart(
            12
          )}`,

          `Real=${Number(
            row.real
          ).toFixed(
            3
          ).padStart(
            12
          )}`,

          `Cump=${cump}`,
        ].join(
          " | "
        )
      );
    }
  }

  const septiembre =
    db.prepare(`
      SELECT
        maquina,
        seccion,
        plan,
        real,
        cumplimiento,
        dias_con_datos

      FROM
        v_cumplimiento_mensual

      WHERE
        anio = 2026
        AND mes = 9

      ORDER BY
        seccion,
        maquina
    `)
      .all() as Array<{
        maquina: string;
        seccion: string;
        plan: number;
        real: number;
        cumplimiento: number | null;
        dias_con_datos: number;
      }>;

  console.log(
    "\nControl mensual 2026-09:"
  );

  for (
    const row of
      septiembre
  ) {
    const cump =
      row.cumplimiento ===
        null
          ? "N/A"
          : `${(
              row.cumplimiento *
              100
            ).toFixed(
              2
            )}%`;

    console.log(
      [
        row.seccion.padEnd(
          12
        ),

        row.maquina.padEnd(
          8
        ),

        `Días=${String(
          row.dias_con_datos
        ).padStart(
          2
        )}`,

        `Plan=${Number(
          row.plan
        ).toFixed(
          3
        ).padStart(
          12
        )}`,

        `Real=${Number(
          row.real
        ).toFixed(
          3
        ).padStart(
          12
        )}`,

        `Cump=${cump}`,
      ].join(
        " | "
      )
    );
  }

  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "VISTAS DE CUMPLIMIENTO ACTUALIZADAS"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    "\nSiguiente prueba:"
  );

  console.log(
    "npm run excel:generar -- --anio=2026 --mes=9"
  );
}

try {
  main();
} catch (
  error
) {
  console.error(
    "\nERROR CONSTRUYENDO VISTAS DE CUMPLIMIENTO"
  );

  console.error(
    error
  );

  process.exit(
    1
  );
}
