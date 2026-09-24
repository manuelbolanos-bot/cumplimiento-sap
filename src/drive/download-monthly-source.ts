import fs from "node:fs";
import path from "node:path";

import {
  db,
} from "../database/db.js";

import {
  DRIVE_FOLDER_MIME,
  XLSX_MIME,
  getAuthorizedDrive,
  sanitizeFileName,
} from "./google-drive.js";

/* =========================================================
   TIPOS
========================================================= */

interface Args {
  periodo: string;
}

interface PeriodConfig {
  periodo: string;
  folder_id: string;
  folder_name: string | null;
  source_file_name: string | null;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  depth: number;
}

/* =========================================================
   CONFIG
========================================================= */

const GOOGLE_SHEET_MIME =
  "application/vnd.google-apps.spreadsheet";

const MAX_DEPTH =
  3;

const OUTPUT_ROOT =
  path.resolve(
    "data/drive-temp"
  );

/*
 * Carpeta raíz oficial existente en Google Drive.
 * NO se crean ni se mueven carpetas mensuales.
 *
 * 6_Cumplimiento diario
 */
const ROOT_FOLDER_ID =
  "1szetH7FKFWwpisqSF6quISkZ87R51fc7";

const ROOT_FOLDER_NAME =
  "6_Cumplimiento diario";

const MONTH_WORDS:
Record<number, string[]> = {
  1: ["enero", "ene", "jan"],
  2: ["febrero", "feb"],
  3: ["marzo", "mar"],
  4: ["abril", "abr", "apr"],
  5: ["mayo", "may"],
  6: ["junio", "jun"],
  7: ["julio", "jul"],
  8: ["agosto", "ago", "aug"],
  9: ["septiembre", "setiembre", "sept", "sep"],
  10: ["octubre", "oct"],
  11: ["noviembre", "nov"],
  12: ["diciembre", "dic", "dec"],
};

/* =========================================================
   ARGUMENTOS
========================================================= */

function leerArgumentos():
Args {
  const periodo =
    process.argv
      .slice(2)
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

  return {
    periodo,
  };
}

/* =========================================================
   CONFIGURACIÓN DEL PERÍODO
========================================================= */

function obtenerConfig(
  periodo: string
): PeriodConfig {
  /*
   * La raíz de Drive es GLOBAL.
   *
   * drive_period_folders se conserva únicamente para:
   * - compatibilidad con process-month.ts;
   * - recordar el archivo seleccionado para cada período;
   * - permitir una preferencia exacta ya guardada.
   *
   * Ya NO se exige configurar una carpeta por cada mes.
   */
  const row =
    db.prepare(`
      SELECT
        periodo,
        folder_id,
        folder_name,
        source_file_name

      FROM
        drive_period_folders

      WHERE
        periodo = ?
    `)
      .get(
        periodo
      ) as PeriodConfig | undefined;

  return {
    periodo,
    folder_id:
      ROOT_FOLDER_ID,
    folder_name:
      ROOT_FOLDER_NAME,
    source_file_name:
      row?.source_file_name ??
      null,
  };
}

/* =========================================================
   UTILIDADES
========================================================= */

function normalizar(
  texto: string
): string {
  return texto
    .toLowerCase()
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim();
}

function esArchivoSoportado(
  file: DriveFile
): boolean {
  return (
    file.mimeType ===
      XLSX_MIME ||
    file.mimeType ===
      GOOGLE_SHEET_MIME ||
    normalizar(
      file.name
    ).endsWith(
      ".xlsx"
    )
  );
}

function coincidePeriodo(
  fileName: string,
  periodo: string
): boolean {
  const [
    anioTexto,
    mesTexto,
  ] =
    periodo.split(
      "-"
    );

  const anio =
    Number(
      anioTexto
    );

  const mes =
    Number(
      mesTexto
    );

  const yy =
    String(
      anio
    ).slice(
      -2
    );

  const name =
    normalizar(
      fileName
    );

  const tieneMes =
    (
      MONTH_WORDS[
        mes
      ] ??
      []
    ).some(
      (
        palabra
      ) =>
        name.includes(
          normalizar(
            palabra
          )
        )
    );

  const tieneAnio =
    name.includes(
      String(
        anio
      )
    ) ||
    name.includes(
      `-${yy}`
    ) ||
    name.includes(
      ` ${yy}`
    );

  return (
    tieneMes &&
    tieneAnio
  );
}

function puntuarArchivo(
  file: DriveFile,
  periodo: string
): number {
  const name =
    normalizar(
      file.name
    );

  let score =
    0;

  if (
    file.mimeType ===
    GOOGLE_SHEET_MIME
  ) {
    score +=
      120;
  } else if (
    file.mimeType ===
    XLSX_MIME
  ) {
    score +=
      110;
  } else if (
    name.endsWith(
      ".xlsx"
    )
  ) {
    score +=
      100;
  }

  if (
    name.includes(
      "cumplimiento"
    )
  ) {
    score +=
      60;
  }

  if (
    name.includes(
      "produccion"
    )
  ) {
    score +=
      40;
  }

  if (
    coincidePeriodo(
      file.name,
      periodo
    )
  ) {
    score +=
      1000;
  }

  score -=
    file.depth;

  return score;
}

/* =========================================================
   LISTADO RECURSIVO
========================================================= */

async function listarHijos(
  folderId: string,
  depth: number
):
Promise<DriveFile[]> {
  const drive =
    await getAuthorizedDrive();

  const encontrados:
    DriveFile[] = [];

  let pageToken:
    string | undefined =
    undefined;

  do {
    const response =
      await drive.files.list({
        q:
          `'${folderId}' in parents and trashed = false`,

        fields:
          "nextPageToken,files(id,name,mimeType,modifiedTime)",

        pageSize:
          1000,

        pageToken,

        supportsAllDrives:
          true,

        includeItemsFromAllDrives:
          true,
      });

    for (
      const file of
        response.data.files ??
        []
    ) {
      if (
        !file.id ||
        !file.name ||
        !file.mimeType
      ) {
        continue;
      }

      encontrados.push({
        id:
          file.id,

        name:
          file.name,

        mimeType:
          file.mimeType,

        modifiedTime:
          file.modifiedTime ??
          null,

        depth,
      });
    }

    pageToken =
      response.data.nextPageToken ||
      undefined;
  } while (
    pageToken
  );

  return encontrados;
}

async function listarRecursivo(
  rootFolderId: string
):
Promise<DriveFile[]> {
  const resultado:
    DriveFile[] = [];

  let pendientes = [
    {
      id:
        rootFolderId,
      depth:
        0,
    },
  ];

  while (
    pendientes.length >
    0
  ) {
    const siguiente:
      Array<{
        id: string;
        depth: number;
      }> = [];

    for (
      const carpeta of
        pendientes
    ) {
      const hijos =
        await listarHijos(
          carpeta.id,
          carpeta.depth
        );

      resultado.push(
        ...hijos
      );

      if (
        carpeta.depth <
        MAX_DEPTH
      ) {
        for (
          const hijo of
            hijos
        ) {
          if (
            hijo.mimeType ===
            DRIVE_FOLDER_MIME
          ) {
            siguiente.push({
              id:
                hijo.id,
              depth:
                carpeta.depth +
                1,
            });
          }
        }
      }
    }

    pendientes =
      siguiente;
  }

  return resultado;
}

/* =========================================================
   SELECCIÓN DEL ARCHIVO
========================================================= */

function seleccionarArchivo(
  files: DriveFile[],
  config: PeriodConfig
): DriveFile {
  const soportados =
    files.filter(
      esArchivoSoportado
    );

  if (
    soportados.length ===
    0
  ) {
    throw new Error(
      `No se encontró ningún Google Sheet o XLSX dentro de "${config.folder_name ?? config.folder_id}".`
    );
  }

  /*
   * Si ya se había configurado un nombre exacto y existe,
   * lo usamos.
   *
   * Para Google Sheets, el nombre guardado puede tener
   * ".xlsx" por una descarga anterior; por eso también
   * comparamos sin esa extensión.
   */
  if (
    config.source_file_name
  ) {
    const esperado =
      normalizar(
        config.source_file_name
      );

    const esperadoSinXlsx =
      esperado.replace(
        /\.xlsx$/,
        ""
      );

    const exacto =
      soportados.find(
        (
          file
        ) => {
          const actual =
            normalizar(
              file.name
            );

          return (
            actual ===
              esperado ||
            actual ===
              esperadoSinXlsx
          );
        }
      );

    if (
      exacto
    ) {
      return exacto;
    }
  }

  /*
   * Primero aislamos archivos que coincidan realmente
   * con el período solicitado.
   *
   * Para 2026-09 esto evita que Ene-26, Feb-26 o Dic-25
   * entren siquiera a competir contra Septiembre-26.
   */
  const delPeriodo =
    soportados.filter(
      (
        file
      ) =>
        coincidePeriodo(
          file.name,
          config.periodo
        )
    );

  if (
    delPeriodo.length ===
    1
  ) {
    return delPeriodo[0];
  }

  const candidatos =
    delPeriodo.length >
    0
      ? delPeriodo
      : soportados;

  const ordenados =
    candidatos
      .map(
        (
          file
        ) => ({
          file,
          score:
            puntuarArchivo(
              file,
              config.periodo
            ),
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          b.score -
          a.score ||
          (
            b.file.modifiedTime ??
            ""
          ).localeCompare(
            a.file.modifiedTime ??
            ""
          )
      );

  const mejor =
    ordenados[0];

  if (
    !mejor
  ) {
    throw new Error(
      "No fue posible identificar el archivo mensual."
    );
  }

  if (
    ordenados.length >
      1 &&
    ordenados[1].score ===
      mejor.score
  ) {
    throw new Error(
      [
        "Hay más de un archivo con la misma prioridad para el período.",
        "",
        ...ordenados
          .slice(
            0,
            10
          )
          .map(
            (
              item
            ) =>
              `- [${item.score}] ${item.file.name} (${item.file.mimeType})`
          ),
        "",
        "Configura el nombre exacto si realmente existen duplicados.",
      ].join(
        "\n"
      )
    );
  }

  return mejor.file;
}

/* =========================================================
   DESCARGA / EXPORTACIÓN
========================================================= */

async function descargar(
  file: DriveFile,
  periodo: string
):
Promise<string> {
  const drive =
    await getAuthorizedDrive();

  const outputDir =
    path.join(
      OUTPUT_ROOT,
      periodo
    );

  fs.mkdirSync(
    outputDir,
    {
      recursive:
        true,
    }
  );

  const outputName =
    file.mimeType ===
      GOOGLE_SHEET_MIME
      ? (
          file.name
            .toLowerCase()
            .endsWith(
              ".xlsx"
            )
            ? file.name
            : `${file.name}.xlsx`
        )
      : file.name;

  const outputPath =
    path.join(
      outputDir,
      sanitizeFileName(
        outputName
      )
    );

  if (
    file.mimeType ===
    GOOGLE_SHEET_MIME
  ) {
    console.log(
      "✓ Tipo detectado: Google Sheets"
    );

    console.log(
      "✓ Exportando Google Sheet a XLSX..."
    );

    const response =
      await drive.files.export(
        {
          fileId:
            file.id,

          mimeType:
            XLSX_MIME,
        },
        {
          responseType:
            "arraybuffer",
        }
      );

    fs.writeFileSync(
      outputPath,
      Buffer.from(
        response.data as ArrayBuffer
      )
    );

    return outputPath;
  }

  console.log(
    "✓ Tipo detectado: XLSX"
  );

  const response =
    await drive.files.get(
      {
        fileId:
          file.id,

        alt:
          "media",

        supportsAllDrives:
          true,
      },
      {
        responseType:
          "arraybuffer",
      }
    );

  fs.writeFileSync(
    outputPath,
    Buffer.from(
      response.data as ArrayBuffer
    )
  );

  return outputPath;
}

/* =========================================================
   MAIN
========================================================= */

async function main():
Promise<void> {
  const {
    periodo,
  } =
    leerArgumentos();

  const config =
    obtenerConfig(
      periodo
    );

  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "DESCARGA DE FUENTE MENSUAL DESDE GOOGLE DRIVE - V3"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `Periodo:   ${periodo}`
  );

  console.log(
    `Carpeta:   ${config.folder_name ?? config.folder_id}`
  );

  console.log(
    `Folder ID: ${config.folder_id}`
  );

  console.log(
    "\nBuscando archivos y Google Sheets..."
  );

  const files =
    await listarRecursivo(
      config.folder_id
    );

  console.log(
    `✓ Elementos encontrados: ${files.length}`
  );

  const soportados =
    files.filter(
      esArchivoSoportado
    );

  console.log(
    `✓ Fuentes XLSX/Google Sheets: ${soportados.length}`
  );

  const selected =
    seleccionarArchivo(
      files,
      config
    );

  console.log(
    `✓ Archivo seleccionado: ${selected.name}`
  );

  console.log(
    `✓ MIME: ${selected.mimeType}`
  );

  console.log(
    `✓ Drive file ID: ${selected.id}`
  );

  const outputPath =
    await descargar(
      selected,
      periodo
    );

  console.log(
    `✓ Disponible localmente: ${outputPath}`
  );

  /*
   * Guardamos/actualizamos el período automáticamente.
   *
   * process-month.ts sigue leyendo source_file_name desde
   * drive_period_folders, así que mantenemos esa tabla sin
   * obligar al usuario a ejecutar drive:configurar cada mes.
   */
  const now =
    new Date()
      .toISOString();

  db.prepare(`
    INSERT INTO drive_period_folders (
      periodo,
      folder_id,
      folder_name,
      source_file_name,
      created_at,
      updated_at
    )
    VALUES (
      @periodo,
      @folderId,
      @folderName,
      @sourceFileName,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT (
      periodo
    )
    DO UPDATE SET
      folder_id =
        excluded.folder_id,

      folder_name =
        excluded.folder_name,

      source_file_name =
        excluded.source_file_name,

      updated_at =
        excluded.updated_at
  `)
    .run({
      periodo,
      folderId:
        ROOT_FOLDER_ID,
      folderName:
        ROOT_FOLDER_NAME,
      sourceFileName:
        path.basename(
          outputPath
        ),
      createdAt:
        now,
      updatedAt:
        now,
    });

  console.log(
    "\nDOWNLOAD_PATH=" +
    outputPath
  );
}

main().catch(
  (
    error
  ) => {
    console.error(
      "\nERROR DESCARGANDO FUENTE DRIVE"
    );

    console.error(
      error
    );

    process.exit(
      1
    );
  }
);
