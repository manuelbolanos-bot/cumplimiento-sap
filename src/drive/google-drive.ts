import fs from "node:fs";
import path from "node:path";

import "dotenv/config";

import {
  google,
  drive_v3,
} from "googleapis";

import {
  OAuth2Client,
} from "google-auth-library";

/* =========================================================
   CONFIG
========================================================= */

const TOKEN_PATH =
  path.resolve(
    "data/google-drive/token.json"
  );

const REDIRECT_URI =
  process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim() ||
  "http://127.0.0.1:42813/oauth2callback";

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
];

/* =========================================================
   OAUTH
========================================================= */

export function getDriveOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenPath: string;
  scopes: string[];
} {
  const clientId =
    process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();

  const clientSecret =
    process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();

  if (
    !clientId ||
    !clientSecret
  ) {
    throw new Error(
      [
        "Faltan credenciales OAuth de Google Drive.",
        "",
        "Agrega al .env:",
        "GOOGLE_DRIVE_CLIENT_ID=...",
        "GOOGLE_DRIVE_CLIENT_SECRET=...",
        `GOOGLE_DRIVE_REDIRECT_URI=${REDIRECT_URI}`,
      ].join(
        "\n"
      )
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri:
      REDIRECT_URI,
    tokenPath:
      TOKEN_PATH,
    scopes:
      SCOPES,
  };
}

export function createOAuthClient():
OAuth2Client {
  const config =
    getDriveOAuthConfig();

  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );
}

export function saveOAuthToken(
  client: OAuth2Client
): void {
  if (
    !client.credentials
  ) {
    throw new Error(
      "No existen credenciales OAuth para guardar."
    );
  }

  fs.mkdirSync(
    path.dirname(
      TOKEN_PATH
    ),
    {
      recursive:
        true,
    }
  );

  fs.writeFileSync(
    TOKEN_PATH,
    JSON.stringify(
      client.credentials,
      null,
      2
    ),
    "utf-8"
  );
}

export function loadOAuthToken(
  client: OAuth2Client
): void {
  if (
    !fs.existsSync(
      TOKEN_PATH
    )
  ) {
    throw new Error(
      [
        "Google Drive todavía no está autenticado.",
        "",
        "Ejecuta primero:",
        "npm run drive:login",
      ].join(
        "\n"
      )
    );
  }

  const credentials =
    JSON.parse(
      fs.readFileSync(
        TOKEN_PATH,
        "utf-8"
      )
    );

  client.setCredentials(
    credentials
  );
}

export async function getAuthorizedDrive():
Promise<drive_v3.Drive> {
  const auth =
    createOAuthClient();

  loadOAuthToken(
    auth
  );

  auth.on(
    "tokens",
    (
      tokens
    ) => {
      /*
       * google-auth-library puede emitir un access token
       * renovado sin volver a entregar refresh_token.
       * Mezclamos ambas credenciales para no perderlo.
       */
      try {
        const anteriores =
          fs.existsSync(
            TOKEN_PATH
          )
            ? JSON.parse(
                fs.readFileSync(
                  TOKEN_PATH,
                  "utf-8"
                )
              )
            : {};

        const combinadas = {
          ...anteriores,
          ...tokens,
        };

        fs.mkdirSync(
          path.dirname(
            TOKEN_PATH
          ),
          {
            recursive:
              true,
          }
        );

        fs.writeFileSync(
          TOKEN_PATH,
          JSON.stringify(
            combinadas,
            null,
            2
          ),
          "utf-8"
        );
      } catch (
        error
      ) {
        console.warn(
          "⚠ No se pudo persistir la renovación del token de Drive.",
          error
        );
      }
    }
  );

  return google.drive({
    version:
      "v3",
    auth,
  });
}

/* =========================================================
   HELPERS
========================================================= */

export const DRIVE_FOLDER_MIME =
  "application/vnd.google-apps.folder";

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function sanitizeFileName(
  name: string
): string {
  return name.replace(
    /[<>:"/\\|?*\x00-\x1F]/g,
    "_"
  );
}

export function escapeDriveQueryValue(
  value: string
): string {
  return value
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /'/g,
      "\\'"
    );
}
