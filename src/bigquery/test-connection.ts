import {
  BigQuery,
} from "@google-cloud/bigquery";

import {
  BIGQUERY_CONFIG,
} from "./config.js";

/* =========================================================
   CLIENTE
========================================================= */

const bigquery =
  new BigQuery({
    projectId:
      BIGQUERY_CONFIG.projectId,
  });

/* =========================================================
   TEST DATASET
========================================================= */

async function validarDataset():
Promise<void> {
  const dataset =
    bigquery.dataset(
      BIGQUERY_CONFIG.datasetId
    );

  const [exists] =
    await dataset.exists();

  if (
    !exists
  ) {
    throw new Error(
      `No existe el dataset ${BIGQUERY_CONFIG.projectId}.${BIGQUERY_CONFIG.datasetId}`
    );
  }

  console.log(
    "✓ Dataset encontrado"
  );
}

/* =========================================================
   TEST TABLA
========================================================= */

async function validarTabla():
Promise<void> {
  const table =
    bigquery
      .dataset(
        BIGQUERY_CONFIG.datasetId
      )
      .table(
        BIGQUERY_CONFIG.tableId
      );

  const [exists] =
    await table.exists();

  if (
    !exists
  ) {
    throw new Error(
      `No existe la tabla ${BIGQUERY_CONFIG.projectId}.${BIGQUERY_CONFIG.datasetId}.${BIGQUERY_CONFIG.tableId}`
    );
  }

  console.log(
    "✓ Tabla encontrada"
  );
}

/* =========================================================
   CONSULTA SOLO LECTURA
========================================================= */

async function consultarResumen():
Promise<void> {
  const tabla =
    `\`${BIGQUERY_CONFIG.projectId}.${BIGQUERY_CONFIG.datasetId}.${BIGQUERY_CONFIG.tableId}\``;

  const query = `
    SELECT
      COUNT(*) AS registros,

      MIN(fecha)
        AS fecha_desde,

      MAX(fecha)
        AS fecha_hasta,

      COUNT(
        DISTINCT fecha
      ) AS dias,

      COUNT(
        DISTINCT maquina
      ) AS maquinas,

      COUNT(
        DISTINCT seccion
      ) AS secciones,

      SUM(
        registros_sap
      ) AS filas_sap,

      SUM(
        plan
      ) AS total_plan,

      SUM(
        real
      ) AS total_real,

      SAFE_DIVIDE(
        SUM(real),
        SUM(plan)
      ) AS cumplimiento_global

    FROM
      ${tabla}
  `;

  const [rows] =
    await bigquery.query({
      query,

      location:
        BIGQUERY_CONFIG.location,

      useLegacySql:
        false,
    });

  if (
    rows.length ===
    0
  ) {
    throw new Error(
      "BigQuery no devolvió resultados."
    );
  }

  console.log(
    "\n" +
    "=".repeat(
      90
    )
  );

  console.log(
    "BIGQUERY - PRUEBA DE CONEXION"
  );

  console.log(
    "=".repeat(
      90
    )
  );

  console.table(
    rows
  );

  console.log(
    "=".repeat(
      90
    )
  );
}

/* =========================================================
   MAIN
========================================================= */

async function main():
Promise<void> {
  console.log(
    "\nValidando conexión con BigQuery..."
  );

  console.log(
    `Proyecto: ${BIGQUERY_CONFIG.projectId}`
  );

  console.log(
    `Dataset:  ${BIGQUERY_CONFIG.datasetId}`
  );

  console.log(
    `Tabla:    ${BIGQUERY_CONFIG.tableId}`
  );

  console.log(
    `Location: ${BIGQUERY_CONFIG.location}`
  );

  console.log();

  await validarDataset();

  await validarTabla();

  await consultarResumen();

  console.log(
    "\n✓ CONEXION BIGQUERY VALIDADA"
  );

  console.log(
    "✓ Prueba ejecutada únicamente en modo lectura"
  );
}

main().catch(
  (
    error
  ) => {
    console.error(
      "\nERROR BIGQUERY"
    );

    console.error(
      error
    );

    process.exit(
      1
    );
  }
);