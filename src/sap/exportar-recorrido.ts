import fs from "node:fs/promises";
import path from "node:path";

import dayjs from "dayjs";
import * as XLSX from "xlsx";

import {
  CDPSession,
  Frame,
  Locator,
  Page,
} from "playwright";

import {
  logger,
} from "../utils/logger.js";

/* =========================================================
   UTILIDAD DE ESPERA
========================================================= */

async function sleep(
  milliseconds: number
): Promise<void> {
  await new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}

/* =========================================================
   BUSCAR FRAME POR TEXTO
========================================================= */

async function findFrameWithText(
  page: Page,
  text: string,
  timeout = 30_000
): Promise<Frame> {
  const limite =
    Date.now() + timeout;

  while (
    Date.now() < limite
  ) {
    for (
      const frame of page.frames()
    ) {
      try {
        const body =
          await frame
            .locator("body")
            .innerText()
            .catch(() => "");

        if (
          body.includes(text)
        ) {
          return frame;
        }
      } catch {
        /*
         * SAP WebGUI puede reconstruir frames.
         */
      }
    }

    await sleep(
      300
    );
  }

  throw new Error(
    `No se encontró ningún frame que contenga: ${text}`
  );
}

/* =========================================================
   CLICK POR TEXTO EN CUALQUIER FRAME
========================================================= */

async function clickTextInAnyFrame(
  page: Page,
  text: string,
  exact = true,
  timeout = 30_000
): Promise<void> {
  const limite =
    Date.now() + timeout;

  while (
    Date.now() < limite
  ) {
    for (
      const frame of page.frames()
    ) {
      try {
        const locator =
          frame
            .getByText(
              text,
              {
                exact,
              }
            )
            .first();

        const visible =
          await locator
            .isVisible()
            .catch(() => false);

        if (
          visible
        ) {
          await locator.click();

          logger.info(
            {
              text,
            },
            "Elemento SAP seleccionado"
          );

          return;
        }
      } catch {
        /*
         * Continuamos buscando.
         */
      }
    }

    await sleep(
      300
    );
  }

  throw new Error(
    `No se encontró elemento visible con texto: ${text}`
  );
}

/* =========================================================
   ABRIR MENÚ > LISTA > EXPORTAR
========================================================= */

async function abrirMenuExportacion(
  page: Page,
  intentos = 4
): Promise<void> {
  for (
    let intento = 1;
    intento <= intentos;
    intento++
  ) {
    logger.info(
      {
        intento,
        intentos,
      },
      "Intentando abrir ruta Menú > Lista > Exportar"
    );

    try {
      if (
        intento > 1
      ) {
        await page
          .keyboard
          .press("Escape")
          .catch(() => {});

        await sleep(
          600
        );
      }

      await clickTextInAnyFrame(
        page,
        "Menú",
        true,
        10_000
      );

      await sleep(
        800
      );

      await clickTextInAnyFrame(
        page,
        "Lista",
        true,
        10_000
      );

      await sleep(
        1_200
      );

      await clickTextInAnyFrame(
        page,
        "Exportar",
        true,
        8_000
      );

      logger.info(
        {
          intento,
        },
        "Ruta Menú > Lista > Exportar abierta correctamente"
      );

      return;
    } catch (error) {
      logger.warn(
        {
          intento,

          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
        "SAP no mantuvo abierta la ruta de exportación"
      );

      if (
        intento === intentos
      ) {
        throw new Error(
          `No fue posible abrir Menú > Lista > Exportar después de ${intentos} intentos`
        );
      }

      await sleep(
        1_500
      );
    }
  }
}

/* =========================================================
   DETECTAR POPUP FINAL XLSX
========================================================= */

async function findFrameWithXlsxInput(
  page: Page,
  timeout = 30_000
): Promise<{
  frame: Frame;
  input: Locator;
}> {
  logger.info(
    "Esperando diálogo final de guardado XLSX"
  );

  const limite =
    Date.now() + timeout;

  while (
    Date.now() < limite
  ) {
    for (
      const frame of page.frames()
    ) {
      try {
        const inputs =
          frame.locator(
            'input:not([type="hidden"])'
          );

        const cantidad =
          await inputs.count();

        for (
          let i = 0;
          i < cantidad;
          i++
        ) {
          const input =
            inputs.nth(i);

          const visible =
            await input
              .isVisible()
              .catch(() => false);

          if (
            !visible
          ) {
            continue;
          }

          const value =
            await input
              .inputValue()
              .catch(() => "");

          if (
            value
              .toLowerCase()
              .endsWith(
                ".xlsx"
              )
          ) {
            logger.info(
              {
                nombreArchivo:
                  value,
              },
              "Campo de archivo XLSX detectado"
            );

            return {
              frame,
              input,
            };
          }
        }
      } catch {
        /*
         * SAP puede reconstruir el popup.
         */
      }
    }

    await sleep(
      300
    );
  }

  throw new Error(
    "No apareció el campo del archivo XLSX"
  );
}

/* =========================================================
   DIRECTORIO RAW
========================================================= */

async function crearDirectorioRaw(): Promise<string> {
  const ahora =
    dayjs();

  const directorio =
    path.resolve(
      process.cwd(),
      "data",
      "raw",
      "sap",
      ahora.format(
        "YYYY"
      ),
      ahora.format(
        "MM"
      )
    );

  await fs.mkdir(
    directorio,
    {
      recursive: true,
    }
  );

  return directorio;
}

/* =========================================================
   VALIDAR BUFFER XLSX REAL

   Un XLSX real es un ZIP.

   Firma:
   50 4B
   P  K

   Además, para este proyecto exigimos
   que exista específicamente la hoja "Data".
========================================================= */

function validarBufferXlsx(
  buffer: Buffer
): {
  valido: boolean;
  hojas: string[];
} {
  try {
    /*
     * XLSX real = ZIP.
     */
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b
    ) {
      return {
        valido: false,
        hojas: [],
      };
    }

    const workbook =
      XLSX.read(
        buffer,
        {
          type: "buffer",
        }
      );

    /*
     * No aceptamos libros genéricos.
     *
     * Nuestro reporte SAP tiene la hoja:
     *
     * Data
     */
    if (
      !workbook
        .SheetNames
        .includes(
          "Data"
        )
    ) {
      return {
        valido: false,
        hojas:
          workbook.SheetNames,
      };
    }

    return {
      valido: true,

      hojas:
        workbook.SheetNames,
    };
  } catch {
    return {
      valido: false,
      hojas: [],
    };
  }
}

/* =========================================================
   VALIDAR ARCHIVO XLSX
========================================================= */

async function validarArchivoXlsx(
  archivo: string
): Promise<{
  valido: boolean;
  hojas: string[];
  bytes: number;
}> {
  try {
    const stat =
      await fs.stat(
        archivo
      );

    if (
      !stat.isFile() ||
      stat.size <= 0
    ) {
      return {
        valido: false,
        hojas: [],
        bytes: 0,
      };
    }

    const buffer =
      await fs.readFile(
        archivo
      );

    const validacion =
      validarBufferXlsx(
        buffer
      );

    return {
      ...validacion,

      bytes:
        stat.size,
    };
  } catch {
    return {
      valido: false,
      hojas: [],
      bytes: 0,
    };
  }
}

/* =========================================================
   OBTENER HEADER CDP
========================================================= */

function obtenerHeader(
  headers:
    Array<{
      name: string;
      value: string;
    }> |
    undefined,

  nombre: string
): string {
  if (
    !headers
  ) {
    return "";
  }

  const encontrado =
    headers.find(
      (header) =>
        header.name
          .toLowerCase() ===
        nombre
          .toLowerCase()
    );

  return encontrado
    ?.value
    ?.trim() ?? "";
}

/* =========================================================
   CONTINUAR RESPUESTA PAUSADA
========================================================= */

async function continuarRespuesta(
  cdp: CDPSession,
  requestId: string
): Promise<void> {
  /*
   * Primero intentamos continueResponse.
   */
  try {
    await cdp.send(
      "Fetch.continueResponse",
      {
        requestId,
      }
    );

    return;
  } catch {
    /*
     * Algunos contextos/versiones pueden
     * no permitir continueResponse.
     */
  }

  /*
   * Fallback.
   */
  try {
    await cdp.send(
      "Fetch.continueRequest",
      {
        requestId,
      }
    );
  } catch {
    /*
     * Si SAP ya cerró el target,
     * no hacemos fallar el pipeline.
     */
  }
}

/* =========================================================
   DECIDIR SI VALE LA PENA LEER EL BODY

   Evitamos intentar obtener cuerpos de recursos que
   claramente no pueden ser nuestro Excel.

   Pero mantenemos criterios amplios porque SAP WebGUI
   usa tipos MIME no convencionales.
========================================================= */

function debeInspeccionarRespuesta(
  url: string,
  headers:
    Array<{
      name: string;
      value: string;
    }> |
    undefined
): boolean {
  const contentType =
    obtenerHeader(
      headers,
      "content-type"
    )
      .toLowerCase();

  const contentDisposition =
    obtenerHeader(
      headers,
      "content-disposition"
    )
      .toLowerCase();

  const urlLower =
    url.toLowerCase();

  /*
   * Señales fuertes.
   */
  if (
    urlLower.includes(
      ".xlsx"
    )
  ) {
    return true;
  }

  if (
    contentDisposition.includes(
      ".xlsx"
    )
  ) {
    return true;
  }

  if (
    contentType.includes(
      "spreadsheet"
    ) ||
    contentType.includes(
      "excel"
    ) ||
    contentType.includes(
      "octet-stream"
    ) ||
    contentType.includes(
      "x-unknown"
    )
  ) {
    return true;
  }

  /*
   * SAP WebGUI puede utilizar endpoints
   * resource/data/filesavedialog.
   */
  if (
    urlLower.includes(
      "/webgui/"
    ) &&
    (
      urlLower.includes(
        "resource"
      ) ||
      urlLower.includes(
        "data"
      ) ||
      urlLower.includes(
        "filesavedialog"
      )
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   INTERCEPTOR HTTP XLSX

   Flujo:

   SAP
   ↓
   Fetch.requestPaused
   ↓
   getResponseBody
   ↓
   comprobar firma PK
   ↓
   comprobar hoja Data
   ↓
   escribir RAW
========================================================= */

async function prepararInterceptorXlsx(
  page: Page,
  timeout = 120_000
): Promise<{
  esperarArchivo:
    Promise<string>;

  detener:
    () => Promise<void>;
}> {
  const context =
    page.context();

  const cdp =
    await context
      .newCDPSession(
        page
      );

  const directorioRaw =
    await crearDirectorioRaw();

  let terminado =
    false;

  let timeoutHandle:
    ReturnType<
      typeof setTimeout
    >;

  let resolver!:
    (
      archivo: string
    ) => void;

  let rechazar!:
    (
      error: Error
    ) => void;

  const esperarArchivo =
    new Promise<string>(
      (
        resolve,
        reject
      ) => {
        resolver =
          resolve;

        rechazar =
          reject;
      }
    );

  /* ======================================================
     TIMEOUT GLOBAL
  ====================================================== */

  timeoutHandle =
    setTimeout(
      () => {
        if (
          terminado
        ) {
          return;
        }

        terminado =
          true;

        rechazar(
          new Error(
            "No se interceptó un XLSX válido con hoja Data dentro del tiempo esperado"
          )
        );
      },
      timeout
    );

  /* ======================================================
     HANDLER
  ====================================================== */

  cdp.on(
    "Fetch.requestPaused",
    async (
      evento
    ) => {
      const requestId =
        evento.requestId;

      /*
       * Solo queremos respuestas.
       *
       * Cuando responseStatusCode no existe,
       * estamos en etapa request.
       */
      if (
        evento.responseStatusCode ===
          undefined
      ) {
        await continuarRespuesta(
          cdp,
          requestId
        );

        return;
      }

      /*
       * Si ya encontramos el XLSX verdadero,
       * dejamos pasar cualquier evento adicional.
       */
      if (
        terminado
      ) {
        await continuarRespuesta(
          cdp,
          requestId
        );

        return;
      }

      const status =
        evento.responseStatusCode;

      const url =
        evento.request.url;

      const headers =
        evento.responseHeaders;

      /*
       * Solo respuestas HTTP exitosas.
       */
      if (
        status < 200 ||
        status >= 300
      ) {
        await continuarRespuesta(
          cdp,
          requestId
        );

        return;
      }

      /*
       * Reducimos ruido.
       */
      if (
        !debeInspeccionarRespuesta(
          url,
          headers
        )
      ) {
        await continuarRespuesta(
          cdp,
          requestId
        );

        return;
      }

      logger.info(
        {
          url,

          status,

          contentType:
            obtenerHeader(
              headers,
              "content-type"
            ),

          contentDisposition:
            obtenerHeader(
              headers,
              "content-disposition"
            ),
        },
        "Inspeccionando respuesta SAP"
      );

      try {
        /* ===============================================
           OBTENER BODY
        =============================================== */

        const respuesta =
          await cdp.send(
            "Fetch.getResponseBody",
            {
              requestId,
            }
          );

        const buffer =
          respuesta
            .base64Encoded
            ? Buffer.from(
                respuesta.body,
                "base64"
              )
            : Buffer.from(
                respuesta.body,
                "utf8"
              );

        logger.info(
          {
            bytes:
              buffer.length,
          },
          "Body de respuesta SAP capturado"
        );

        /* ===============================================
           VALIDAR XLSX REAL
        =============================================== */

        const validacion =
          validarBufferXlsx(
            buffer
          );

        if (
          !validacion.valido
        ) {
          /*
           * Para respuestas pequeñas mostramos
           * contenido textual de diagnóstico.
           */
          let preview:
            string | undefined;

          if (
            buffer.length > 0 &&
            buffer.length <= 500
          ) {
            const texto =
              buffer
                .toString(
                  "utf8"
                )
                .replace(
                  /[\r\n\t]+/g,
                  " "
                )
                .replace(
                  /\s+/g,
                  " "
                )
                .trim();

            if (
              texto.length > 0
            ) {
              preview =
                texto.slice(
                  0,
                  300
                );
            }
          }

          logger.info(
            {
              url,

              bytes:
                buffer.length,

              hojasDetectadas:
                validacion.hojas,

              preview,
            },
            "Respuesta SAP ignorada: no es el XLSX Data"
          );

          /*
           * La respuesta de 60 bytes que vimos
           * anteriormente llegará aquí.
           *
           * IMPORTANTE:
           * NO terminamos el interceptor.
           *
           * Seguimos esperando el archivo verdadero.
           */
          await continuarRespuesta(
            cdp,
            requestId
          );

          return;
        }

        /* ===============================================
           XLSX CORRECTO
        =============================================== */

        logger.info(
          {
            bytes:
              buffer.length,

            hojas:
              validacion.hojas,
          },
          "XLSX real de SAP detectado"
        );

        /* ===============================================
           GUARDAR DIRECTAMENTE EN RAW
        =============================================== */

        const nombreFinal =
          `SAP_0135_${dayjs().format(
            "YYYYMMDD_HHmmss"
          )}.xlsx`;

        const rutaFinal =
          path.join(
            directorioRaw,
            nombreFinal
          );

        await fs.writeFile(
          rutaFinal,
          buffer
        );

        /* ===============================================
           VALIDACIÓN POST-ESCRITURA
        =============================================== */

        const validacionArchivo =
          await validarArchivoXlsx(
            rutaFinal
          );

        if (
          !validacionArchivo.valido
        ) {
          /*
           * Eliminamos un RAW inválido.
           */
          await fs
            .unlink(
              rutaFinal
            )
            .catch(
              () => {}
            );

          throw new Error(
            "El XLSX interceptado dejó de ser válido después de escribirlo en RAW"
          );
        }

        /*
         * Ahora sí marcamos como terminado.
         */
        terminado =
          true;

        clearTimeout(
          timeoutHandle
        );

        logger.info(
          {
            ruta:
              rutaFinal,

            bytes:
              validacionArchivo.bytes,

            hojas:
              validacionArchivo.hojas,
          },
          "XLSX interceptado y guardado directamente en RAW"
        );

        /*
         * Permitimos que Chromium termine
         * su propio flujo.
         */
        await continuarRespuesta(
          cdp,
          requestId
        );

        resolver(
          rutaFinal
        );
      } catch (error) {
        /*
         * IMPORTANTE:
         *
         * Un error al inspeccionar una respuesta
         * no mata el interceptor.
         *
         * SAP puede tener varias respuestas
         * intermedias antes del XLSX verdadero.
         */
        logger.warn(
          {
            url,

            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
          "No fue posible procesar esta respuesta SAP"
        );

        await continuarRespuesta(
          cdp,
          requestId
        );
      }
    }
  );

  /* ======================================================
     ACTIVAR FETCH

     requestStage Response es fundamental.
  ====================================================== */

  await cdp.send(
    "Fetch.enable",
    {
      patterns: [
        {
          urlPattern: "*",
          requestStage:
            "Response",
        },
      ],
    }
  );

  logger.info(
    "Interceptor HTTP de descargas XLSX habilitado"
  );

  /* ======================================================
     DETENER INTERCEPTOR
  ====================================================== */

  const detener =
    async (): Promise<void> => {
      clearTimeout(
        timeoutHandle
      );

      try {
        await cdp.send(
          "Fetch.disable"
        );
      } catch {
        /*
         * SAP pudo cerrar target/context.
         */
      }

      try {
        await cdp.detach();
      } catch {
        /*
         * Ya estaba desconectado.
         */
      }
    };

  return {
    esperarArchivo,
    detener,
  };
}

/* =========================================================
   EXPORTACIÓN COMPLETA
========================================================= */

export async function exportarRecorrido(
  page: Page
): Promise<string> {
  logger.info(
    "Iniciando exportación XLSX de SAP"
  );

  /* ======================================================
     1. CONFIRMAR ALV
  ====================================================== */

  const reporteFrame =
    await findFrameWithText(
      page,
      "Nombre de Material"
    );

  const textoReporte =
    await reporteFrame
      .locator("body")
      .innerText();

  if (
    !textoReporte.includes(
      "Orden"
    ) ||
    !textoReporte.includes(
      "Operador"
    )
  ) {
    throw new Error(
      "El ALV no está disponible"
    );
  }

  logger.info(
    "ALV confirmado antes de exportar"
  );

  /* ======================================================
     2. MENÚ > LISTA > EXPORTAR
  ====================================================== */

  await abrirMenuExportacion(
    page,
    4
  );

  await sleep(
    900
  );

  /* ======================================================
     3. HOJA DE CÁLCULO
  ====================================================== */

  await clickTextInAnyFrame(
    page,
    "Hoja de cálculo...",
    true,
    15_000
  );

  logger.info(
    "Opción Hoja de cálculo seleccionada"
  );

  /* ======================================================
     4. EXPORT AS
  ====================================================== */

  await findFrameWithText(
    page,
    "Export As",
    30_000
  );

  logger.info(
    "Diálogo Export As detectado"
  );

  /* ======================================================
     5. EXPORTAR A...
  ====================================================== */

  await clickTextInAnyFrame(
    page,
    "Exportar a...",
    true,
    20_000
  );

  logger.info(
    "Exportar a... seleccionado"
  );

  /* ======================================================
     6. DIÁLOGO FINAL
  ====================================================== */

  const {
    frame: saveFrame,
    input: nombreInput,
  } =
    await findFrameWithXlsxInput(
      page,
      30_000
    );

  logger.info(
    "Diálogo final de guardado detectado"
  );

  const nombreSap =
    await nombreInput
      .inputValue();

  logger.info(
    {
      nombreSap,
    },
    "Nombre propuesto por SAP"
  );

  /* ======================================================
     7. BOTÓN OK
  ====================================================== */

  const okButton =
    saveFrame
      .getByText(
        "OK",
        {
          exact: true,
        }
      )
      .first();

  await okButton.waitFor(
    {
      state:
        "visible",

      timeout:
        30_000,
    }
  );

  logger.info(
    "Botón OK encontrado"
  );

  /* ======================================================
     8. ACTIVAR INTERCEPTOR ANTES DEL CLICK
  ====================================================== */

  const interceptor =
    await prepararInterceptorXlsx(
      page,
      120_000
    );

  try {
    /* ====================================================
       9. CONFIRMAR EXPORTACIÓN
    ==================================================== */

    await okButton.click();

    logger.info(
      "Confirmación de exportación enviada"
    );

    /* ====================================================
       10. ESPERAR XLSX REAL
    ==================================================== */

    const rutaFinal =
      await interceptor
        .esperarArchivo;

    logger.info(
      {
        ruta:
          rutaFinal,
      },
      "Exportación SAP capturada correctamente"
    );

    return rutaFinal;
  } finally {
    await interceptor
      .detener();
  }
}