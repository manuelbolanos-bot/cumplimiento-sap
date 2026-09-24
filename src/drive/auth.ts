import http from "node:http";
import {
  exec,
} from "node:child_process";

import {
  createOAuthClient,
  getDriveOAuthConfig,
  saveOAuthToken,
} from "./google-drive.js";

/* =========================================================
   ABRIR NAVEGADOR
========================================================= */

function abrirNavegador(
  url: string
): void {
  if (
    process.platform ===
    "win32"
  ) {
    exec(
      `start "" "${url}"`
    );

    return;
  }

  if (
    process.platform ===
    "darwin"
  ) {
    exec(
      `open "${url}"`
    );

    return;
  }

  exec(
    `xdg-open "${url}"`
  );
}

/* =========================================================
   LOGIN
========================================================= */

async function main():
Promise<void> {
  const auth =
    createOAuthClient();

  const config =
    getDriveOAuthConfig();

  const authUrl =
    auth.generateAuthUrl({
      access_type:
        "offline",

      prompt:
        "consent",

      scope:
        config.scopes,
    });

  const redirectUrl =
    new URL(
      config.redirectUri
    );

  const port =
    Number(
      redirectUrl.port ||
      (
        redirectUrl.protocol ===
        "https:"
          ? 443
          : 80
      )
    );

  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "AUTENTICACIÓN GOOGLE DRIVE"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `Callback local: ${config.redirectUri}`
  );

  console.log(
    "\nAbriendo navegador..."
  );

  const code =
    await new Promise<string>(
      (
        resolve,
        reject
      ) => {
        const server =
          http.createServer(
            async (
              req,
              res
            ) => {
              try {
                if (
                  !req.url
                ) {
                  res.statusCode =
                    400;

                  res.end(
                    "Solicitud inválida."
                  );

                  return;
                }

                const currentUrl =
                  new URL(
                    req.url,
                    `${redirectUrl.protocol}//${redirectUrl.host}`
                  );

                if (
                  currentUrl.pathname !==
                  redirectUrl.pathname
                ) {
                  res.statusCode =
                    404;

                  res.end(
                    "Ruta no encontrada."
                  );

                  return;
                }

                const error =
                  currentUrl.searchParams.get(
                    "error"
                  );

                if (
                  error
                ) {
                  res.statusCode =
                    400;

                  res.end(
                    "Autorización cancelada."
                  );

                  server.close();

                  reject(
                    new Error(
                      `Google devolvió error OAuth: ${error}`
                    )
                  );

                  return;
                }

                const code =
                  currentUrl.searchParams.get(
                    "code"
                  );

                if (
                  !code
                ) {
                  res.statusCode =
                    400;

                  res.end(
                    "No se recibió código OAuth."
                  );

                  return;
                }

                res.statusCode =
                  200;

                res.setHeader(
                  "Content-Type",
                  "text/html; charset=utf-8"
                );

                res.end(
                  [
                    "<!doctype html>",
                    "<html>",
                    "<head><meta charset=\"utf-8\"><title>Google Drive</title></head>",
                    "<body style=\"font-family:Arial,sans-serif;padding:40px\">",
                    "<h2>Google Drive autorizado correctamente.</h2>",
                    "<p>Ya puedes cerrar esta ventana y volver a la consola.</p>",
                    "</body>",
                    "</html>",
                  ].join(
                    ""
                  )
                );

                server.close();

                resolve(
                  code
                );
              } catch (
                error
              ) {
                res.statusCode =
                  500;

                res.end(
                  "Error procesando OAuth."
                );

                server.close();

                reject(
                  error
                );
              }
            }
          );

        server.on(
          "error",
          reject
        );

        server.listen(
          port,
          redirectUrl.hostname,
          () => {
            console.log(
              "\nSi el navegador no se abre automáticamente, copia esta URL:"
            );

            console.log(
              authUrl
            );

            abrirNavegador(
              authUrl
            );
          }
        );
      }
    );

  console.log(
    "\nCódigo OAuth recibido."
  );

  const {
    tokens,
  } =
    await auth.getToken(
      code
    );

  auth.setCredentials(
    tokens
  );

  saveOAuthToken(
    auth
  );

  console.log(
    `✓ Token guardado en: ${config.tokenPath}`
  );

  console.log(
    "✓ Google Drive quedó autorizado."
  );
}

main().catch(
  (
    error
  ) => {
    console.error(
      "\nERROR AUTENTICANDO GOOGLE DRIVE"
    );

    console.error(
      error
    );

    process.exit(
      1
    );
  }
);
