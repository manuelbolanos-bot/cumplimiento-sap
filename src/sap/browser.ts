import fs from "node:fs/promises";
import path from "node:path";

import {
  BrowserContext,
  chromium,
  Page,
} from "playwright";

import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export interface SapBrowser {
  context: BrowserContext;
  page: Page;
}

/* =========================================================
   RUTA DE DESCARGAS TEMPORALES
========================================================= */

export function getTemporaryDownloadPath(): string {
  return path.resolve(
    process.cwd(),
    "data",
    "downloads-temp"
  );
}

/* =========================================================
   UTILIDADES DE LANZAMIENTO
========================================================= */

function describirError(
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

async function existeRuta(
  ruta: string
): Promise<boolean> {
  try {
    await fs.access(
      ruta
    );

    return true;
  } catch {
    return false;
  }
}

async function prepararPerfilRecuperacion(
  recoveryProfilePath: string
): Promise<void> {
  /*
   * El perfil de recuperación es independiente del perfil
   * principal. Podemos recrearlo sin tocar ni corromper la
   * sesión persistente normal.
   */
  if (
    await existeRuta(
      recoveryProfilePath
    )
  ) {
    await fs.rm(
      recoveryProfilePath,
      {
        recursive:
          true,

        force:
          true,
      }
    );
  }

  await fs.mkdir(
    recoveryProfilePath,
    {
      recursive:
        true,
    }
  );
}

async function lanzarContextoPersistente(
  profilePath: string
): Promise<BrowserContext> {
  return chromium.launchPersistentContext(
    profilePath,
    {
      headless:
        env.SAP_HEADLESS,

      acceptDownloads:
        true,

      viewport: {
        width:
          1600,

        height:
          900,
      },

      args: [
        "--start-maximized",

        /*
         * Refuerzos de estabilidad para Windows.
         *
         * No modifican la navegación SAP ni la lógica de
         * autenticación. Únicamente reducen causas comunes de
         * cierre temprano del proceso Chromium.
         */
        "--disable-gpu",
        "--disable-software-rasterizer",
      ],
    }
  );
}

/* =========================================================
   ABRIR NAVEGADOR SAP

   Estrategia:
   1. intentar con data/browser-profile;
   2. si Chromium se cierra durante launchPersistentContext,
      NO tocar ni borrar el perfil principal;
   3. crear un perfil limpio e independiente:
      data/browser-profile-recovery;
   4. reintentar una sola vez.

   Esto cubre:
   - perfil Chromium bloqueado;
   - perfil dañado;
   - cierre inmediato TargetClosed;
   - errores spawn UNKNOWN asociados al perfil persistente.

   Si el segundo intento también falla, se conserva el error
   real para diagnóstico.
========================================================= */

export async function openSapBrowser(): Promise<SapBrowser> {
  const profilePath =
    path.resolve(
      process.cwd(),
      "data",
      "browser-profile"
    );

  const recoveryProfilePath =
    path.resolve(
      process.cwd(),
      "data",
      "browser-profile-recovery"
    );

  const downloadsPath =
    getTemporaryDownloadPath();

  await fs.mkdir(
    profilePath,
    {
      recursive:
        true,
    }
  );

  await fs.mkdir(
    downloadsPath,
    {
      recursive:
        true,
    }
  );

  logger.info(
    {
      profilePath,
      downloadsPath,
    },
    "Iniciando navegador SAP"
  );

  let context:
    BrowserContext;

  let profileEnUso =
    profilePath;

  try {
    context =
      await lanzarContextoPersistente(
        profilePath
      );

    logger.info(
      {
        profilePath,
      },
      "Chromium iniciado con perfil SAP principal"
    );

  } catch (
    primerError
  ) {
    logger.warn(
      {
        error:
          describirError(
            primerError
          ),

        profilePath,
      },
      "Falló el inicio de Chromium con el perfil principal; se intentará con un perfil limpio de recuperación"
    );

    await prepararPerfilRecuperacion(
      recoveryProfilePath
    );

    profileEnUso =
      recoveryProfilePath;

    try {
      context =
        await lanzarContextoPersistente(
          recoveryProfilePath
        );

      logger.warn(
        {
          recoveryProfilePath,
        },
        "Chromium iniciado con perfil de recuperación. SAP puede solicitar autenticación nuevamente."
      );

    } catch (
      segundoError
    ) {
      logger.error(
        {
          primerError:
            describirError(
              primerError
            ),

          segundoError:
            describirError(
              segundoError
            ),

          profilePath,
          recoveryProfilePath,
        },
        "No fue posible iniciar Chromium ni con el perfil principal ni con el perfil de recuperación"
      );

      throw segundoError;
    }
  }

  context.setDefaultTimeout(
    env.SAP_TIMEOUT_MS
  );

  const pages =
    context.pages();

  const page =
    pages.length >
    0
      ? pages[
          0
        ]
      : await context.newPage();

  /* =======================================================
     CDP - CONTROL DIRECTO DE DESCARGAS CHROMIUM
  ======================================================= */

  const cdp =
    await context.newCDPSession(
      page
    );

  cdp.on(
    "Browser.downloadWillBegin",
    (
      evento
    ) => {
      logger.info(
        {
          guid:
            evento.guid,

          archivo:
            evento.suggestedFilename,

          url:
            evento.url,
        },
        "Chromium: descarga iniciada"
      );
    }
  );

  cdp.on(
    "Browser.downloadProgress",
    (
      evento
    ) => {
      if (
        evento.state ===
          "completed" ||
        evento.state ===
          "canceled"
      ) {
        logger.info(
          {
            guid:
              evento.guid,

            estado:
              evento.state,

            recibidos:
              evento.receivedBytes,

            total:
              evento.totalBytes,
          },
          "Chromium: estado final de descarga"
        );
      }
    }
  );

  await cdp.send(
    "Browser.setDownloadBehavior",
    {
      behavior:
        "allow",

      downloadPath:
        downloadsPath,

      eventsEnabled:
        true,
    }
  );

  logger.info(
    {
      downloadsPath,
      profileEnUso,
    },
    "Descargas directas de Chromium habilitadas"
  );

  return {
    context,
    page,
  };
}
