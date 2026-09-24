import {
  db,
} from "./db.js";

import {
  logger,
} from "../utils/logger.js";

/* =========================================================
   TIPOS
========================================================= */

interface BddNormalizadaRow {
  fuente: string;

  fecha: string;
  anio: number;
  mes: number;
  dia: number;

  maquina: string;
  seccion: string;

  puestos_sap: string | null;

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
   COMPROBAR DEPENDENCIAS
========================================================= */

function validarDependencias(): void {
  const daily =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM
        sqlite_master

      WHERE
        type = 'view'

        AND name =
        'v_daily_compliance'
    `)
    .get() as {
      total: number;
    };

  if (
    daily.total !==
    1
  ) {
    throw new Error(
      "No existe v_daily_compliance. Ejecuta primero: npm run db:diario"
    );
  }

  const mapping =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM
        machine_mapping

      WHERE
        activo = 1
    `)
    .get() as {
      total: number;
    };

  if (
    mapping.total ===
    0
  ) {
    throw new Error(
      "No existen máquinas activas en machine_mapping. Ejecuta primero: npm run db:config-produccion"
    );
  }
}

/* =========================================================
   CREAR VISTA BDD NORMALIZADA
========================================================= */

function crearVista(): void {
  db.exec(`
    DROP VIEW IF EXISTS
      v_bdd_normalizada;

    CREATE VIEW
      v_bdd_normalizada
    AS

    SELECT
      /*
       * Nombre lógico del flujo.
       *
       * En events la fuente física es SAP_ZPP10I,
       * pero a nivel de negocio este proceso se
       * identifica como SAP_PRINCIPAL.
       */
      'SAP_PRINCIPAL'
        AS fuente,

      fecha,
      anio,
      mes,
      dia,

      maquina,
      seccion,

      puestos_sap,

      plan,
      real,

      diferencia,

      cumplimiento,

      desperdicio,
      horas,

      ordenes,
      registros_sap,

      operadores,
      turnos

    FROM
      v_daily_compliance;
  `);
}

/* =========================================================
   VALIDACIONES
========================================================= */

function validarSinBolsera(): void {
  const row =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM
        v_bdd_normalizada

      WHERE
        seccion =
        'BOLSERA'
    `)
    .get() as {
      total: number;
    };

  if (
    row.total !==
    0
  ) {
    throw new Error(
      "Error de integridad: BOLSERA apareció en v_bdd_normalizada."
    );
  }
}

function validarMaterialPrueba(): void {
  /*
   * La exclusión ocurre antes,
   * en v_sap_principal_rows.
   *
   * Confirmamos que el material de prueba
   * no esté entrando a la capa principal.
   */
  const row =
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

  if (
    row.total !==
    0
  ) {
    throw new Error(
      "Error de integridad: el material 10249848 llegó a la capa productiva."
    );
  }
}

function validarDuplicados(): void {
  /*
   * La clave lógica de esta capa es:
   *
   * fecha + maquina + seccion
   */
  const duplicados =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM (
        SELECT
          fecha,
          maquina,
          seccion,
          COUNT(*) AS cantidad

        FROM
          v_bdd_normalizada

        GROUP BY
          fecha,
          maquina,
          seccion

        HAVING
          COUNT(*) > 1
      )
    `)
    .get() as {
      total: number;
    };

  if (
    duplicados.total !==
    0
  ) {
    throw new Error(
      `Se detectaron ${duplicados.total} claves duplicadas en v_bdd_normalizada.`
    );
  }
}

function validarCalculos(): void {
  const inconsistencias =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM
        v_bdd_normalizada

      WHERE
        ABS(
          diferencia -
          (
            real -
            plan
          )
        ) > 0.000001
    `)
    .get() as {
      total: number;
    };

  if (
    inconsistencias.total !==
    0
  ) {
    throw new Error(
      `Se detectaron ${inconsistencias.total} diferencias inconsistentes.`
    );
  }
}

/* =========================================================
   RESUMEN
========================================================= */

function mostrarResumen(): void {
  const resumen =
    db.prepare(`
      SELECT
        COUNT(*) AS registros_normalizados,

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
        ) AS fecha_desde,

        MAX(
          fecha
        ) AS fecha_hasta,

        SUM(
          plan
        ) AS total_plan,

        SUM(
          real
        ) AS total_real,

        SUM(
          desperdicio
        ) AS total_desperdicio,

        SUM(
          horas
        ) AS total_horas,

        SUM(
          registros_sap
        ) AS filas_sap_utilizadas,

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
        END AS cumplimiento_global

      FROM
        v_bdd_normalizada
    `)
    .get() as {
      registros_normalizados: number;

      dias: number;
      maquinas: number;
      secciones: number;

      fecha_desde:
        | string
        | null;

      fecha_hasta:
        | string
        | null;

      total_plan: number;
      total_real: number;

      total_desperdicio:
        number;

      total_horas:
        number;

      filas_sap_utilizadas:
        number;

      cumplimiento_global:
        number | null;
    };

  console.log(
    "\n" +
    "=".repeat(
      95
    )
  );

  console.log(
    "BDD NORMALIZADA - RESUMEN"
  );

  console.log(
    "=".repeat(
      95
    )
  );

  console.log(
    `Registros normalizados: ${resumen.registros_normalizados}`
  );

  console.log(
    `Dias con informacion:    ${resumen.dias}`
  );

  console.log(
    `Maquinas:                ${resumen.maquinas}`
  );

  console.log(
    `Secciones:               ${resumen.secciones}`
  );

  console.log(
    `Periodo:                 ${resumen.fecha_desde ?? "-"} -> ${resumen.fecha_hasta ?? "-"}`
  );

  console.log(
    `Filas SAP utilizadas:    ${resumen.filas_sap_utilizadas}`
  );

  console.log(
    `Total Plan:              ${Number(
      resumen.total_plan ??
      0
    ).toLocaleString(
      "en-US",
      {
        maximumFractionDigits:
          3,
      }
    )}`
  );

  console.log(
    `Total Real:              ${Number(
      resumen.total_real ??
      0
    ).toLocaleString(
      "en-US",
      {
        maximumFractionDigits:
          3,
      }
    )}`
  );

  console.log(
    `Total Desperdicio:       ${Number(
      resumen.total_desperdicio ??
      0
    ).toLocaleString(
      "en-US",
      {
        maximumFractionDigits:
          3,
      }
    )}`
  );

  console.log(
    `Total Horas:             ${Number(
      resumen.total_horas ??
      0
    ).toLocaleString(
      "en-US",
      {
        maximumFractionDigits:
          2,
      }
    )}`
  );

  const cumplimiento =
    resumen
      .cumplimiento_global ===
    null
      ? "-"
      : `${(
          resumen
            .cumplimiento_global *
          100
        ).toFixed(
          2
        )}%`;

  console.log(
    `Cumplimiento global:     ${cumplimiento}`
  );

  console.log(
    "=".repeat(
      95
    )
  );
}

/* =========================================================
   RESUMEN POR SECCION
========================================================= */

function mostrarPorSeccion(): void {
  const rows =
    db.prepare(`
      SELECT
        seccion,

        COUNT(*) AS registros,

        COUNT(
          DISTINCT maquina
        ) AS maquinas,

        SUM(
          registros_sap
        ) AS filas_sap,

        SUM(
          plan
        ) AS plan,

        SUM(
          real
        ) AS real,

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
        v_bdd_normalizada

      GROUP BY
        seccion

      ORDER BY
        seccion
    `)
    .all() as Array<{
      seccion: string;

      registros: number;
      maquinas: number;
      filas_sap: number;

      plan: number;
      real: number;

      cumplimiento:
        | number
        | null;
    }>;

  console.log(
    "\nRESUMEN POR SECCION"
  );

  console.log(
    "-".repeat(
      105
    )
  );

  console.log(
    [
      "SECCION".padEnd(
        16
      ),

      "REG".padStart(
        6
      ),

      "MAQ".padStart(
        5
      ),

      "FILAS SAP".padStart(
        10
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
      105
    )
  );

  for (
    const row of rows
  ) {
    const cumplimiento =
      row.cumplimiento ===
      null
        ? "-"
        : `${(
            row.cumplimiento *
            100
          ).toFixed(
            2
          )}%`;

    console.log(
      [
        row.seccion
          .padEnd(
            16
          ),

        String(
          row.registros
        ).padStart(
          6
        ),

        String(
          row.maquinas
        ).padStart(
          5
        ),

        String(
          row.filas_sap
        ).padStart(
          10
        ),

        Number(
          row.plan ??
          0
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
          row.real ??
          0
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

        cumplimiento
          .padStart(
            10
          ),
      ].join(
        " | "
      )
    );
  }

  console.log(
    "-".repeat(
      105
    )
  );
}

/* =========================================================
   MUESTRA
========================================================= */

function mostrarMuestra(): void {
  const rows =
    db.prepare(`
      SELECT
        fuente,

        fecha,
        anio,
        mes,
        dia,

        maquina,
        seccion,

        puestos_sap,

        plan,
        real,
        diferencia,
        cumplimiento,

        desperdicio,
        horas,

        ordenes,
        registros_sap

      FROM
        v_bdd_normalizada

      ORDER BY
        fecha DESC,
        seccion,
        maquina

      LIMIT 30
    `)
    .all() as BddNormalizadaRow[];

  console.log(
    "\nMUESTRA BDD NORMALIZADA"
  );

  console.log(
    "-".repeat(
      155
    )
  );

  console.log(
    [
      "FECHA".padEnd(
        12
      ),

      "SECCION".padEnd(
        14
      ),

      "MAQ".padEnd(
        6
      ),

      "PLAN".padStart(
        16
      ),

      "REAL".padStart(
        16
      ),

      "DIF".padStart(
        16
      ),

      "CUMP".padStart(
        10
      ),

      "DESP".padStart(
        12
      ),

      "HORAS".padStart(
        10
      ),

      "ORD".padStart(
        5
      ),

      "FILAS".padStart(
        7
      ),

      "PUESTOS",
    ].join(
      " | "
    )
  );

  console.log(
    "-".repeat(
      155
    )
  );

  for (
    const row of rows
  ) {
    const cumplimiento =
      row.cumplimiento ===
      null
        ? "-"
        : `${(
            row.cumplimiento *
            100
          ).toFixed(
            2
          )}%`;

    console.log(
      [
        row.fecha
          .padEnd(
            12
          ),

        row.seccion
          .padEnd(
            14
          ),

        row.maquina
          .padEnd(
            6
          ),

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
          .padStart(
            16
          ),

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
          .padStart(
            16
          ),

        Number(
          row.diferencia
        )
          .toLocaleString(
            "en-US",
            {
              maximumFractionDigits:
                3,
            }
          )
          .padStart(
            16
          ),

        cumplimiento
          .padStart(
            10
          ),

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
          .padStart(
            12
          ),

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
          .padStart(
            10
          ),

        String(
          row.ordenes
        ).padStart(
          5
        ),

        String(
          row.registros_sap
        ).padStart(
          7
        ),

        row.puestos_sap ??
        "-",
      ].join(
        " | "
      )
    );
  }

  console.log(
    "-".repeat(
      155
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
    "GENERANDO BDD NORMALIZADA"
  );

  logger.info(
    "=================================="
  );

  validarDependencias();

  crearVista();

  validarSinBolsera();

  validarMaterialPrueba();

  validarDuplicados();

  validarCalculos();

  mostrarResumen();

  mostrarPorSeccion();

  mostrarMuestra();

  logger.info(
    "=================================="
  );

  logger.info(
    "BDD NORMALIZADA VALIDADA"
  );

  logger.info(
    "=================================="
  );
}

main();