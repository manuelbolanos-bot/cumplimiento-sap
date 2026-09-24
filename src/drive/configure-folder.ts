import {
  db,
} from "../database/db.js";

import {
  DRIVE_FOLDER_MIME,
  getAuthorizedDrive,
} from "./google-drive.js";

/* =========================================================
   TIPOS
========================================================= */

interface Args {
  periodo: string;
  folderId: string;
  archivo: string | null;
}

/* =========================================================
   ARGUMENTOS
========================================================= */

function leerArgumentos():
Args {
  let periodo:
    string | null =
    null;

  let folderId:
    string | null =
    null;

  let archivo:
    string | null =
    null;

  for (
    const arg of
      process.argv.slice(2)
  ) {
    if (
      arg.startsWith(
        "--periodo="
      )
    ) {
      periodo =
        arg.substring(
          "--periodo=".length
        );
    }

    if (
      arg.startsWith(
        "--folder-id="
      )
    ) {
      folderId =
        arg.substring(
          "--folder-id=".length
        );
    }

    if (
      arg.startsWith(
        "--archivo="
      )
    ) {
      archivo =
        arg.substring(
          "--archivo=".length
        );
    }
  }

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

  if (
    !folderId
  ) {
    throw new Error(
      "Debes indicar --folder-id=ID_CARPETA_DRIVE"
    );
  }

  return {
    periodo,
    folderId,
    archivo:
      archivo?.trim() ||
      null,
  };
}

/* =========================================================
   ESQUEMA
========================================================= */

function asegurarEsquema():
void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS drive_period_folders (
      periodo TEXT PRIMARY KEY,

      folder_id TEXT NOT NULL,
      folder_name TEXT,

      source_file_name TEXT,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

/* =========================================================
   MAIN
========================================================= */

async function main():
Promise<void> {
  const {
    periodo,
    folderId,
    archivo,
  } =
    leerArgumentos();

  asegurarEsquema();

  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "CONFIGURAR CARPETA DRIVE DEL PERÍODO"
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
    `Folder ID: ${folderId}`
  );

  const drive =
    await getAuthorizedDrive();

  const folder =
    await drive.files.get({
      fileId:
        folderId,

      fields:
        "id,name,mimeType,driveId,parents",

      supportsAllDrives:
        true,
    });

  if (
    folder.data.mimeType !==
    DRIVE_FOLDER_MIME
  ) {
    throw new Error(
      `El ID ${folderId} no corresponde a una carpeta de Google Drive.`
    );
  }

  const folderName =
    folder.data.name ||
    folderId;

  console.log(
    `Carpeta:   ${folderName}`
  );

  if (
    archivo
  ) {
    console.log(
      `Archivo preferido: ${archivo}`
    );
  } else {
    console.log(
      "Archivo preferido: detección automática"
    );
  }

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
      folderId,
      folderName,
      sourceFileName:
        archivo,
      createdAt:
        now,
      updatedAt:
        now,
    });

  console.log(
    "\n✓ Carpeta mensual guardada."
  );

  console.log(
    "\nSiguiente prueba:"
  );

  console.log(
    `npm run drive:descargar -- --periodo=${periodo}`
  );
}

main().catch(
  (
    error
  ) => {
    console.error(
      "\nERROR CONFIGURANDO DRIVE"
    );

    console.error(
      error
    );

    process.exit(
      1
    );
  }
);
