import fs from "node:fs";
import path from "node:path";

import {
  BigQuery,
} from "@google-cloud/bigquery";

import {
  BIGQUERY_CONFIG,
} from "./config.js";

/* =========================================================
   CLIENTE BIGQUERY
========================================================= */

const bigquery =
  new BigQuery({
    projectId:
      BIGQUERY_CONFIG.projectId,
  });

/* =========================================================
   ESQUEMA OFICIAL
========================================================= */

const schema = [
  {
    name: "fuente",
    type: "STRING",
  },
  {
    name: "fecha",
    type: "DATE",
  },
  {
    name: "anio",
    type: "INTEGER",
  },
  {
    name: "mes",
    type: "INTEGER",
  },
  {
    name: "dia",
    type: "INTEGER",
  },
  {
    name: "maquina",
    type: "STRING",
  },
  {
    name: "seccion",
    type: "STRING",
  },
  {
    name: "puestos_sap",
    type: "STRING",
  },
  {
    name: "plan",
    type: "NUMERIC",
  },
  {
    name: "real",
    type: "NUMERIC",
  },
  {
    name: "diferencia",
    type: "NUMERIC",
  },
  {
    name: "cumplimiento",
    type: "FLOAT",
  },
  {
    name: "desperdicio",
    type: "NUMERIC",
  },
  {
    name: "horas",
    type: "FLOAT",
  },
  {
    name: "ordenes",
    type: "INTEGER",
  },
  {
    name: "registros_sap",
    type: "INTEGER",
  },
  {
    name: "operadores",
    type: "STRING",
  },
  {
    name: "turnos",
    type: "STRING",
  },
];

/* =========================================================
   BUSCAR ULTIMO CSV
========================================================= */

function encontrarCsvMasReciente():
string {
  const exportDir =
    path.resolve(
      "data/export"
    );

  if (
    !fs.existsSync(
      exportDir
    )
  ) {
    throw new Error(
      "No existe la carpeta data/export."
    );
  }

  const archivos =
    fs.readdirSync(
      exportDir
    )
    .filter(
      (file) =>
        file.startsWith(
          "bdd_normalizada_"
        ) &&
        file.endsWith(
          ".csv"
        )
    )
    .map(
      (file) => {
        const fullPath =
          path.join(
            exportDir,
            file
          );

        return {
          file,
          fullPath,

          modified:
            fs.statSync(
              fullPath
            ).mtimeMs,
        };
      }
    )
    .sort(
      (a, b) =>
        b.modified -
        a.modified
    );

  if (
    archivos.length ===
    0
  ) {
    throw new Error(
      "No existen archivos bdd_normalizada_*.csv en data/export."
    );
  }

  return archivos[0]
    .fullPath;
}

/* =========================================================
   CONTAR FILAS CSV
========================================================= */

function contarRegistrosCsv(
  csvPath: string
): number {
  const contenido =
    fs.readFileSync(
      csvPath,
      "utf8"
    );

  const lineas =
    contenido
      .split(
        /\r?\n/
      )
      .filter(
        (linea) =>
          linea.trim()
            .length >
          0
      );

  /*
   * Restamos encabezado.
   */
  return Math.max(
    lineas.length - 1,
    0
  );
}

/* =========================================================
   CARGAR TABLA PRODUCTIVA

   IMPORTANTE:

   BigQuery Sandbox no permite DML.

   Por eso reemplazamos la tabla completa
   utilizando un LOAD JOB con WRITE_TRUNCATE.

   La operación de carga es atómica:
   si falla, la tabla anterior permanece.
========================================================= */

async function cargarProductiva(
  csvPath: string
): Promise<void> {
  const table =
    bigquery
      .dataset(
        BIGQUERY_CONFIG.datasetId
      )
      .table(
        BIGQUERY_CONFIG.tableId
      );

  console.log(
    "\nCargando tabla productiva..."
  );

  console.log(
    `Archivo: ${csvPath}`
  );

  const [
    job,
  ] =
    await table.createLoadJob(
      csvPath,
      {
        location:
          BIGQUERY_CONFIG.location,

        sourceFormat:
          "CSV",

        skipLeadingRows:
          1,

        writeDisposition:
          "WRITE_TRUNCATE",

        schema: {
          fields:
            schema,
        },
      }
    );

  console.log(
    `Job: ${job.id}`
  );

  /*
   * Esperamos finalización.
   */
  await job.promise();

  const [
    metadata,
  ] =
    await job.getMetadata();

  const status =
    metadata.status;

  if (
    status?.errorResult
  ) {
    throw new Error(
      `Falló carga BigQuery: ${status.errorResult.message}`
    );
  }

  if (
    status?.errors &&
    status.errors.length >
      0
  ) {
    const mensajes =
      status.errors
        .map(
          (
            error:
              any
          ) =>
            error.message
        )
        .join(
          " | "
        );

    throw new Error(
      `BigQuery reportó errores: ${mensajes}`
    );
  }

  console.log(
    "✓ Tabla productiva reemplazada"
  );
}

/* =========================================================
   OBTENER RESUMEN BIGQUERY
========================================================= */

interface ResumenBigQuery {
  registros:
    number;

  fecha_desde:
    {
      value:
        string;
    };

  fecha_hasta:
    {
      value:
        string;
    };

  dias:
    number;

  maquinas:
    number;

  secciones:
    number;

  filas_sap:
    number;

  total_plan:
    unknown;

  total_real:
    unknown;

  cumplimiento_global:
    unknown;
}

async function obtenerResumen():
Promise<ResumenBigQuery> {
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

  const [
    rows,
  ] =
    await bigquery.query({
      query,

      location:
        BIGQUERY_CONFIG.location,

      useLegacySql:
        false,
    });

  if (
    rows.length !==
    1
  ) {
    throw new Error(
      "BigQuery no devolvió un resumen válido."
    );
  }

  return rows[0] as
    ResumenBigQuery;
}

/* =========================================================
   VALIDAR RESULTADO
========================================================= */

async function validarResultado(
  registrosEsperados:
    number
): Promise<void> {
  const resumen =
    await obtenerResumen();

  const registrosBigQuery =
    Number(
      resumen.registros
    );

  if (
    registrosBigQuery !==
    registrosEsperados
  ) {
    throw new Error(
      `Cantidad de registros incorrecta. CSV=${registrosEsperados}, BigQuery=${registrosBigQuery}`
    );
  }

  if (
    registrosBigQuery ===
    0
  ) {
    throw new Error(
      "BigQuery quedó sin registros."
    );
  }

  console.log(
    "\n" +
    "=".repeat(
      95
    )
  );

  console.log(
    "BIGQUERY - VALIDACION POST SYNC"
  );

  console.log(
    "=".repeat(
      95
    )
  );

  console.log(
    `Registros:     ${resumen.registros}`
  );

  console.log(
    `Periodo:       ${resumen.fecha_desde.value} -> ${resumen.fecha_hasta.value}`
  );

  console.log(
    `Dias:          ${resumen.dias}`
  );

  console.log(
    `Maquinas:      ${resumen.maquinas}`
  );

  console.log(
    `Secciones:     ${resumen.secciones}`
  );

  console.log(
    `Filas SAP:     ${resumen.filas_sap}`
  );

  console.log(
    "=".repeat(
      95
    )
  );
}

/* =========================================================
   DIAGNÓSTICO SEGURO DE AUTENTICACIÓN GOOGLE

   new BigQuery({ projectId }) usa Application Default
   Credentials (ADC) cuando no se especifica un keyFilename.

   Un error invalid_rapt / reauth related error normalmente
   significa que la sesión ADC del usuario necesita una
   reautenticación interactiva.

   IMPORTANTE:
   No imprimimos el objeto Gaxios completo porque puede
   contener refresh_token u otros secretos en request.data.
========================================================= */

function mensajeErrorSeguro(
  error: unknown
): string {
  if (
    error instanceof Error
  ) {
    return `${error.name}: ${error.message}`;
  }

  return String(
    error
  );
}

function esErrorReautenticacionGoogle(
  error: unknown
): boolean {
  const texto =
    mensajeErrorSeguro(
      error
    ).toLowerCase();

  return (
    texto.includes(
      "invalid_rapt"
    ) ||
    (
      texto.includes(
        "invalid_grant"
      ) &&
      texto.includes(
        "reauth"
      )
    )
  );
}

function mostrarAyudaReautenticacion():
void {
  console.error(
    "\nLa credencial Application Default Credentials (ADC) necesita reautenticación."
  );

  console.error(
    "\nEjecuta en PowerShell:"
  );

  console.error(
    "  gcloud auth application-default login"
  );

  console.error(
    "\nLuego establece el proyecto de cuota:"
  );

  console.error(
    `  gcloud auth application-default set-quota-project ${BIGQUERY_CONFIG.projectId}`
  );

  console.error(
    "\nDespués vuelve a ejecutar:"
  );

  console.error(
    "  npm run bigquery:sync"
  );

  console.error(
    "\nSi Google vuelve a solicitar MFA/Duo, completa esa validación en el navegador."
  );
}

/* =========================================================
   MAIN
========================================================= */

async function main():
Promise<void> {
  console.log(
    "\n=================================="
  );

  console.log(
    "SINCRONIZACION BIGQUERY"
  );

  console.log(
    "Modo: SNAPSHOT COMPLETO"
  );

  console.log(
    "Compatible con BigQuery Sandbox"
  );

  console.log(
    "=================================="
  );

  const csvPath =
    encontrarCsvMasReciente();

  const registrosCsv =
    contarRegistrosCsv(
      csvPath
    );

  console.log(
    `CSV seleccionado: ${csvPath}`
  );

  console.log(
    `Registros CSV: ${registrosCsv}`
  );

  if (
    registrosCsv ===
    0
  ) {
    throw new Error(
      "El CSV está vacío. Se canceló la sincronización para proteger BigQuery."
    );
  }

  await cargarProductiva(
    csvPath
  );

  await validarResultado(
    registrosCsv
  );

  console.log(
    "\n✓ SINCRONIZACION BIGQUERY COMPLETADA"
  );

  console.log(
    "✓ Snapshot reemplazado correctamente"
  );
}

main().catch(
  (
    error
  ) => {
    console.error(
      "\nERROR SINCRONIZANDO BIGQUERY"
    );

    /*
     * Nunca imprimir el objeto Gaxios completo:
     * puede incluir refresh_token y otros secretos.
     */
    console.error(
      mensajeErrorSeguro(
        error
      )
    );

    if (
      esErrorReautenticacionGoogle(
        error
      )
    ) {
      mostrarAyudaReautenticacion();
    }

    process.exit(
      1
    );
  }
);