import fs from "node:fs";
import path from "node:path";
import {
  spawnSync,
} from "node:child_process";

/* =========================================================
   PROCESO MAESTRO MENSUAL

   Flujo:
   1. SAP -> RAW / STAGING / PROCESSED / SQLite
   2. Google Drive -> Google Sheet/XLSX mensual
   3. BOLSERA -> SQLite
   4. Vistas semánticas consolidadas
   5. Excel mensual V3.3
   6. Exportación BDD normalizada
   7. BigQuery snapshot

   Uso:
     npm run proceso:mensual -- --desde=2026-09-01 --hasta=2026-09-24

   Restricción:
   - desde y hasta deben pertenecer al mismo mes, porque
     se genera un único libro mensual por ejecución.
========================================================= */

interface Args {
  desde: string;
  hasta: string;
  periodo: string;
  anio: number;
  mes: number;
}

/* =========================================================
   ARGUMENTOS
========================================================= */

function leerValorArgumento(
  nombre: string
): string | null {
  const prefijo =
    `--${nombre}=`;

  const encontrado =
    process.argv
      .slice(
        2
      )
      .find(
        (
          arg
        ) =>
          arg.startsWith(
            prefijo
          )
      );

  if (
    !encontrado
  ) {
    return null;
  }

  return encontrado.substring(
    prefijo.length
  );
}

function validarFechaIso(
  valor: string,
  nombre: string
): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      valor
    )
  ) {
    throw new Error(
      `${nombre} debe tener formato YYYY-MM-DD. Recibido: ${valor}`
    );
  }

  const [
    anio,
    mes,
    dia,
  ] =
    valor
      .split(
        "-"
      )
      .map(
        Number
      );

  const fecha =
    new Date(
      anio,
      mes - 1,
      dia
    );

  if (
    fecha.getFullYear() !==
      anio ||
    fecha.getMonth() !==
      mes - 1 ||
    fecha.getDate() !==
      dia
  ) {
    throw new Error(
      `${nombre} no es una fecha válida: ${valor}`
    );
  }
}

function leerArgumentos():
Args {
  const desde =
    leerValorArgumento(
      "desde"
    );

  const hasta =
    leerValorArgumento(
      "hasta"
    );

  if (
    !desde
  ) {
    throw new Error(
      "Debes indicar --desde=YYYY-MM-DD"
    );
  }

  if (
    !hasta
  ) {
    throw new Error(
      "Debes indicar --hasta=YYYY-MM-DD"
    );
  }

  validarFechaIso(
    desde,
    "--desde"
  );

  validarFechaIso(
    hasta,
    "--hasta"
  );

  if (
    desde >
    hasta
  ) {
    throw new Error(
      `El rango es inválido: ${desde} es posterior a ${hasta}.`
    );
  }

  const periodoDesde =
    desde.substring(
      0,
      7
    );

  const periodoHasta =
    hasta.substring(
      0,
      7
    );

  if (
    periodoDesde !==
    periodoHasta
  ) {
    throw new Error(
      [
        "El proceso maestro V1 genera un único libro mensual por ejecución.",
        `--desde pertenece a ${periodoDesde}`,
        `--hasta pertenece a ${periodoHasta}`,
        "",
        "Ejecuta un mes por separado.",
      ].join(
        "\n"
      )
    );
  }

  const [
    anio,
    mes,
  ] =
    periodoHasta
      .split(
        "-"
      )
      .map(
        Number
      );

  return {
    desde,
    hasta,
    periodo:
      periodoHasta,
    anio,
    mes,
  };
}

/* =========================================================
   TSX DIRECTO

   Se evita npm/cmd para los subprocesos porque ya vimos
   que Windows altera argumentos con rutas que contienen
   espacios. Cada argumento se entrega como elemento real
   del argv.
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
      "No se encontró el CLI de tsx.",
      "Ejecuta npm install antes de continuar.",
    ].join(
      "\n"
    )
  );
}

function ejecutarTsx(
  numeroEtapa: number,
  totalEtapas: number,
  titulo: string,
  scriptPath: string,
  args: string[] = []
): void {
  console.log(
    `\n[${numeroEtapa}/${totalEtapas}] ${titulo}`
  );

  console.log(
    "-".repeat(
      100
    )
  );

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
      [
        `No existe el script requerido para "${titulo}":`,
        script,
      ].join(
        "\n"
      )
    );
  }

  const tsxCli =
    obtenerTsxCli();

  const inicio =
    Date.now();

  const result =
    spawnSync(
      process.execPath,
      [
        tsxCli,
        script,
        ...args,
      ],
      {
        cwd:
          process.cwd(),

        env:
          process.env,

        stdio:
          "inherit",

        shell:
          false,
      }
    );

  const segundos =
    (
      (
        Date.now() -
        inicio
      ) /
      1000
    ).toFixed(
      1
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
      `${titulo} terminó con código ${result.status} después de ${segundos}s.`
    );
  }

  console.log(
    `✓ Etapa completada en ${segundos}s.`
  );
}

/* =========================================================
   PREVALIDACIONES
========================================================= */

function validarArchivosRequeridos():
void {
  const requeridos = [
    "src/pipeline/run-pipeline.ts",
    "src/drive/download-monthly-source.ts",
    "src/bolsera/import-bolsera.ts",
    "src/database/build-compliance-period-views.ts",
    "src/excel/generate-monthly-workbook.ts",
    "src/export/export-bdd-normalizada.ts",
    "src/bigquery/sync-bdd.ts",
    "data/templates/PLANTILLA_MAESTRA_LIMPIA.xlsx",
  ];

  const faltantes =
    requeridos.filter(
      (
        item
      ) =>
        !fs.existsSync(
          path.resolve(
            item
          )
        )
    );

  if (
    faltantes.length >
    0
  ) {
    throw new Error(
      [
        "Faltan archivos requeridos para el proceso maestro:",
        ...faltantes.map(
          (
            item
          ) =>
            `- ${item}`
        ),
      ].join(
        "\n"
      )
    );
  }

  const tokenDrive =
    path.resolve(
      "data/google-drive/token.json"
    );

  if (
    !fs.existsSync(
      tokenDrive
    )
  ) {
    throw new Error(
      [
        "Google Drive todavía no está autorizado.",
        "",
        "Ejecuta:",
        "npm run drive:login",
      ].join(
        "\n"
      )
    );
  }
}

/* =========================================================
   MAIN
========================================================= */

function main():
void {
  const args =
    leerArgumentos();

  validarArchivosRequeridos();

  const TOTAL_ETAPAS =
    7;

  const inicioTotal =
    Date.now();

  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "PROCESO MAESTRO - CUMPLIMIENTO PRODUCCIÓN"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `Desde:   ${args.desde}`
  );

  console.log(
    `Hasta:   ${args.hasta}`
  );

  console.log(
    `Periodo: ${args.periodo}`
  );

  console.log(
    "\nFlujo:"
  );

  console.log(
    "SAP → SQLite → Drive/Bolsera → Vistas → Excel → Export BDD → BigQuery"
  );

  /* =====================================================
     1/7 SAP
  ===================================================== */

  ejecutarTsx(
    1,
    TOTAL_ETAPAS,
    "Extrayendo SAP y actualizando SQLite...",
    "src/pipeline/run-pipeline.ts",
    [
      `--desde=${args.desde}`,
      `--hasta=${args.hasta}`,
      "--solo-sap",
    ]
  );

  /* =====================================================
     2/7 DRIVE
  ===================================================== */

  ejecutarTsx(
    2,
    TOTAL_ETAPAS,
    "Descargando fuente mensual de Google Drive...",
    "src/drive/download-monthly-source.ts",
    [
      `--periodo=${args.periodo}`,
    ]
  );

  /*
   * download-monthly-source.ts registra el nombre local
   * descargado en drive_period_folders.source_file_name.
   * Para no duplicar parsing ni volver a depender de cmd,
   * process-month.ts ya sabe localizar esa ruta correctamente.
   *
   * Sin embargo, process-month.ts también regeneraría vistas
   * y Excel. En el maestro ejecutamos cada etapa por separado,
   * así que necesitamos obtener la ruta desde SQLite.
   */
  const databaseModulePath =
    path.resolve(
      "src/database/db.js"
    );

  void databaseModulePath;

  /* =====================================================
     LEER ARCHIVO DRIVE DESDE SQLITE
  ===================================================== */

  // Import dinámico síncrono no es posible dentro de esta
  // función CommonJS/ESM sin cambiar la estructura. En lugar
  // de eso usamos un pequeño helper temporal ejecutado con TSX
  // generado dentro de data/tmp.
  const helperDir =
    path.resolve(
      "data/tmp"
    );

  fs.mkdirSync(
    helperDir,
    {
      recursive:
        true,
    }
  );

  const helperPath =
    path.join(
      helperDir,
      "_master-import-bolsera.ts"
    );

  const helperCode =
`import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { db } from "../../src/database/db.js";

const periodo = ${JSON.stringify(
  args.periodo
)};

const row = db.prepare(\`
  SELECT source_file_name
  FROM drive_period_folders
  WHERE periodo = ?
\`).get(periodo) as {
  source_file_name: string | null;
} | undefined;

if (!row?.source_file_name) {
  throw new Error(
    "Drive no registró source_file_name para " + periodo
  );
}

const archivo = path.resolve(
  "data/drive-temp",
  periodo,
  row.source_file_name
);

if (!fs.existsSync(archivo)) {
  throw new Error(
    "No existe el archivo Drive descargado: " + archivo
  );
}

const tsxCandidates = [
  path.resolve("node_modules/tsx/dist/cli.mjs"),
  path.resolve("node_modules/tsx/dist/cli.cjs"),
];

const tsxCli = tsxCandidates.find(fs.existsSync);

if (!tsxCli) {
  throw new Error("No se encontró tsx.");
}

const importer = path.resolve(
  "src/bolsera/import-bolsera.ts"
);

const result = spawnSync(
  process.execPath,
  [
    tsxCli,
    importer,
    "--archivo=" + archivo,
    "--periodo=" + periodo,
  ],
  {
    stdio: "inherit",
    shell: false,
    cwd: process.cwd(),
    env: process.env,
  }
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
`;

  fs.writeFileSync(
    helperPath,
    helperCode,
    "utf8"
  );

  try {
    ejecutarTsx(
      3,
      TOTAL_ETAPAS,
      "Importando BOLSERA a SQLite...",
      helperPath,
      []
    );
  } finally {
    try {
      fs.unlinkSync(
        helperPath
      );
    } catch {
      // No bloquea el proceso si Windows mantiene el helper
      // unos milisegundos abierto.
    }
  }

  /* =====================================================
     4/7 VISTAS
  ===================================================== */

  ejecutarTsx(
    4,
    TOTAL_ETAPAS,
    "Reconstruyendo vistas semánticas consolidadas...",
    "src/database/build-compliance-period-views.ts",
    []
  );

  /* =====================================================
     5/7 EXCEL
  ===================================================== */

  ejecutarTsx(
    5,
    TOTAL_ETAPAS,
    "Generando Excel mensual V3.3...",
    "src/excel/generate-monthly-workbook.ts",
    [
      `--anio=${args.anio}`,
      `--mes=${args.mes}`,
    ]
  );

  /* =====================================================
     6/7 EXPORT BDD
  ===================================================== */

  ejecutarTsx(
    6,
    TOTAL_ETAPAS,
    "Exportando BDD normalizada...",
    "src/export/export-bdd-normalizada.ts",
    []
  );

  /* =====================================================
     7/7 BIGQUERY
  ===================================================== */

  ejecutarTsx(
    7,
    TOTAL_ETAPAS,
    "Sincronizando snapshot final con BigQuery...",
    "src/bigquery/sync-bdd.ts",
    []
  );

  const segundosTotal =
    (
      (
        Date.now() -
        inicioTotal
      ) /
      1000
    ).toFixed(
      1
    );

  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "PROCESO MAESTRO COMPLETADO"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `Periodo: ${args.periodo}`
  );

  console.log(
    `Rango SAP: ${args.desde} → ${args.hasta}`
  );

  console.log(
    `Duración total: ${segundosTotal}s`
  );

  console.log(
    "\n✓ SAP procesado."
  );

  console.log(
    "✓ BOLSERA descargada/importada."
  );

  console.log(
    "✓ SQLite consolidado."
  );

  console.log(
    "✓ Excel mensual generado."
  );

  console.log(
    "✓ BDD exportada."
  );

  console.log(
    "✓ BigQuery sincronizado."
  );

  console.log(
    "\n⚠ Pendiente funcional conocido: Transferido."
  );
}

try {
  main();
} catch (
  error
) {
  console.error(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.error(
    "ERROR EN PROCESO MAESTRO"
  );

  console.error(
    "=".repeat(
      100
    )
  );

  console.error(
    error
  );

  process.exit(
    1
  );
}
