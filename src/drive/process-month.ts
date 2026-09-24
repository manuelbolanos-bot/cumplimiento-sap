import fs from "node:fs";
import path from "node:path";
import {
  spawnSync,
} from "node:child_process";

import {
  db,
} from "../database/db.js";

/* =========================================================
   ARGUMENTOS
========================================================= */

function leerPeriodo():
string {
  const periodo =
    process.argv
      .slice(
        2
      )
      .find(
        (
          arg
        ) =>
          arg.startsWith(
            "--periodo="
          )
      )
      ?.substring(
        "--periodo=".length
      );

  if (
    !periodo ||
    !/^\d{4}-\d{2}$/.test(
      periodo
    )
  ) {
    throw new Error(
      "Debes indicar --periodo=AAAA-MM"
    );
  }

  return periodo;
}

/* =========================================================
   EJECUTAR TYPESCRIPT DIRECTAMENTE

   Importante:
   NO usamos "npm run ..." para encadenar las etapas.

   En Windows, npm + cmd.exe + rutas con espacios termina
   alterando argumentos como:

     --archivo=C:\Ruta con espacios\archivo.xlsx

   Al ejecutar TSX directamente con spawnSync y una lista
   real de argumentos, Windows recibe la ruta completa como
   un único argumento, sin necesidad de comillas manuales.
========================================================= */

function obtenerTsxCli():
string {
  const candidatos = [
    path.resolve(
      "node_modules/tsx/dist/cli.mjs"
    ),

    path.resolve(
      "node_modules/tsx/dist/cli.cjs"
    ),
  ];

  for (
    const candidato of
      candidatos
  ) {
    if (
      fs.existsSync(
        candidato
      )
    ) {
      return candidato;
    }
  }

  throw new Error(
    [
      "No se encontró el CLI de tsx en node_modules.",
      "",
      "Ejecuta:",
      "npm install",
    ].join(
      "\n"
    )
  );
}

function ejecutarTsx(
  scriptPath: string,
  args: string[],
  titulo: string
): void {
  console.log(
    `\n${titulo}`
  );

  console.log(
    "-".repeat(
      100
    )
  );

  const tsxCli =
    obtenerTsxCli();

  const script =
    path.resolve(
      scriptPath
    );

  if (
    !fs.existsSync(
      script
    )
  ) {
    throw new Error(
      `No existe el script:\n${script}`
    );
  }

  const result =
    spawnSync(
      process.execPath,
      [
        tsxCli,
        script,
        ...args,
      ],
      {
        stdio:
          "inherit",

        shell:
          false,

        cwd:
          process.cwd(),

        env:
          process.env,
      }
    );

  if (
    result.error
  ) {
    throw result.error;
  }

  if (
    result.status !==
    0
  ) {
    throw new Error(
      `${titulo} terminó con código ${result.status}.`
    );
  }
}

/* =========================================================
   LOCALIZAR ARCHIVO DESCARGADO
========================================================= */

function obtenerArchivoDescargado(
  periodo: string
): string {
  const config =
    db.prepare(`
      SELECT
        source_file_name

      FROM
        drive_period_folders

      WHERE
        periodo = ?
    `)
      .get(
        periodo
      ) as {
        source_file_name: string | null;
      } | undefined;

  if (
    !config?.source_file_name
  ) {
    throw new Error(
      "Drive no dejó registrado el archivo mensual seleccionado."
    );
  }

  const filePath =
    path.resolve(
      "data/drive-temp",
      periodo,
      config.source_file_name
    );

  if (
    !fs.existsSync(
      filePath
    )
  ) {
    throw new Error(
      `No existe el archivo descargado:\n${filePath}`
    );
  }

  return filePath;
}

/* =========================================================
   MAIN
========================================================= */

function main():
void {
  const periodo =
    leerPeriodo();

  const [
    anio,
    mes,
  ] =
    periodo
      .split(
        "-"
      )
      .map(
        Number
      );

  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "PROCESO MENSUAL - DRIVE → BOLSERA → SQLITE → EXCEL"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `Periodo: ${periodo}`
  );

  /* =====================================================
     1/4 DRIVE
  ===================================================== */

  ejecutarTsx(
    "src/drive/download-monthly-source.ts",
    [
      `--periodo=${periodo}`,
    ],
    "[1/4] Descargando fuente mensual desde Drive..."
  );

  const archivo =
    obtenerArchivoDescargado(
      periodo
    );

  console.log(
    `\nArchivo mensual listo: ${archivo}`
  );

  /* =====================================================
     2/4 BOLSERA
  ===================================================== */

  ejecutarTsx(
    "src/bolsera/import-bolsera.ts",
    [
      `--archivo=${archivo}`,
      `--periodo=${periodo}`,
    ],
    "[2/4] Importando BOLSERA..."
  );

  /* =====================================================
     3/4 VISTAS
  ===================================================== */

  ejecutarTsx(
    "src/database/build-compliance-period-views.ts",
    [],
    "[3/4] Reconstruyendo vistas semánticas..."
  );

  /* =====================================================
     4/4 EXCEL
  ===================================================== */

  ejecutarTsx(
    "src/excel/generate-monthly-workbook.ts",
    [
      `--anio=${anio}`,
      `--mes=${mes}`,
    ],
    "[4/4] Generando Excel mensual..."
  );

  /* =====================================================
     RESULTADO
  ===================================================== */

  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "PROCESO MENSUAL COMPLETADO"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    "\n✓ Drive mensual descargado."
  );

  console.log(
    "✓ BOLSERA importada."
  );

  console.log(
    "✓ Vistas semánticas reconstruidas."
  );

  console.log(
    "✓ Excel mensual generado."
  );

  console.log(
    "\nNota:"
  );

  console.log(
    "La extracción SAP principal todavía se ejecuta mediante el pipeline SAP existente."
  );
}

try {
  main();
} catch (
  error
) {
  console.error(
    "\nERROR EN PROCESO MENSUAL"
  );

  console.error(
    error
  );

  process.exit(
    1
  );
}
