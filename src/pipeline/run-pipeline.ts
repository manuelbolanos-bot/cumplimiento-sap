import fs from "node:fs";
import path from "node:path";

import {
  spawnSync,
} from "node:child_process";

import {
  logger,
} from "../utils/logger.js";

import {
  openSapBrowser,
} from "../sap/browser.js";

import {
  loginSap,
} from "../sap/login.js";

import {
  openZpp10i,
} from "../sap/launchpad.js";

import {
  openRecorrido,
} from "../sap/recorrido.js";

import {
  completarParametrosRecorrido,
} from "../sap/parametros-recorrido.js";

import {
  ejecutarRecorrido,
} from "../sap/ejecutar-recorrido.js";

import {
  exportarRecorrido,
} from "../sap/exportar-recorrido.js";

import {
  procesarRawSap,
} from "../ingestion/process-latest-service.js";

import {
  procesarStaging,
} from "../processing/process-latest-service.js";

import {
  ingerirProcessed,
} from "../database/ingest-latest-service.js";

import {
  db,
} from "../database/db.js";

import {
  startImportRun,
  finishImportRun,
  createImportAlert,
  failImportRun,
} from "../database/import-control.js";

import {
  validatePeriod,
} from "../validation/validate-period.js";

/* =========================================================
   ARGUMENTOS CLI
========================================================= */

interface ArgumentosPipeline {
  desde?: string;
  hasta?: string;
  soloSap?: boolean;
}

function leerArgumentos():
ArgumentosPipeline {
  const argumentos:
    ArgumentosPipeline = {};

  for (
    const argumento
    of process.argv.slice(2)
  ) {
    if (
      argumento.startsWith(
        "--desde="
      )
    ) {
      argumentos.desde =
        argumento.substring(
          "--desde=".length
        );

      continue;
    }

    if (
      argumento.startsWith(
        "--hasta="
      )
    ) {
      argumentos.hasta =
        argumento.substring(
          "--hasta=".length
        );

      continue;
    }

    if (
      argumento ===
      "--solo-sap"
    ) {
      argumentos.soloSap =
        true;

      continue;
    }
  }

  /*
   * Si únicamente viene --desde,
   * trabajamos un solo día.
   */
  if (
    argumentos.desde &&
    !argumentos.hasta
  ) {
    argumentos.hasta =
      argumentos.desde;
  }

  /*
   * No permitimos --hasta sin --desde.
   */
  if (
    argumentos.hasta &&
    !argumentos.desde
  ) {
    throw new Error(
      "Si utilizas --hasta también debes indicar --desde."
    );
  }

  return argumentos;
}

/* =========================================================
   FECHA LOCAL
========================================================= */

function obtenerFechaActualLocal():
string {
  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}

/* =========================================================
   PERIODO EFECTIVO
========================================================= */

function obtenerPeriodoEfectivo(
  argumentos:
    ArgumentosPipeline
): {
  desde: string;
  hasta: string;
} {
  if (
    argumentos.desde &&
    argumentos.hasta
  ) {
    return {
      desde:
        argumentos.desde,

      hasta:
        argumentos.hasta,
    };
  }

  const hoy =
    obtenerFechaActualLocal();

  return {
    desde: hoy,
    hasta: hoy,
  };
}

/* =========================================================
   EVENTO PROCESADO
========================================================= */

interface EventoProcesado {
  fechaReporte?: string;

  puestoTrabajo?: string;

  codigoMaterial?:
    | string
    | number;

  [key: string]:
    unknown;
}

/* =========================================================
   LEER PROCESSED
========================================================= */

function leerEventosProcessed(
  processedPath: string
): EventoProcesado[] {
  if (
    !fs.existsSync(
      processedPath
    )
  ) {
    throw new Error(
      `No existe el archivo processed: ${processedPath}`
    );
  }

  const contenido =
    JSON.parse(
      fs.readFileSync(
        processedPath,
        "utf8"
      )
    );

  if (
    Array.isArray(
      contenido
    )
  ) {
    return contenido;
  }

  if (
    Array.isArray(
      contenido.eventos
    )
  ) {
    return contenido.eventos;
  }

  if (
    Array.isArray(
      contenido.data
    )
  ) {
    return contenido.data;
  }

  if (
    Array.isArray(
      contenido.registros
    )
  ) {
    return contenido.registros;
  }

  throw new Error(
    "El archivo processed no contiene un arreglo de eventos reconocido."
  );
}

/* =========================================================
   MAPEO PRODUCTIVO
========================================================= */

interface MachineMappingRow {
  puesto_sap: string;
  maquina: string;
  proceso: string;
  activo: number;
}

function obtenerMapeoMaquinas():
Map<
  string,
  MachineMappingRow
> {
  const rows =
    db.prepare(`
      SELECT
        puesto_sap,
        maquina,
        proceso,
        activo

      FROM
        machine_mapping
    `)
    .all() as MachineMappingRow[];

  const mapa =
    new Map<
      string,
      MachineMappingRow
    >();

  for (
    const row of rows
  ) {
    mapa.set(
      row.puesto_sap,
      row
    );
  }

  return mapa;
}

/* =========================================================
   ANALISIS DE NEGOCIO
========================================================= */

interface PuestoIgnorado {
  puestoSap: string;

  motivo:
    | "NO_CONFIGURADO"
    | "NO_INCLUIDO";

  registros: number;

  maquina:
    | string
    | null;

  seccion:
    | string
    | null;
}

interface AnalisisNegocio {
  filasSap: number;

  filasElegibles: number;

  filasIgnoradas: number;

  ordenesPruebaIgnoradas:
    number;

  puestosIgnorados:
    PuestoIgnorado[];
}

function analizarEventosNegocio(
  eventos:
    EventoProcesado[]
): AnalisisNegocio {
  const mapping =
    obtenerMapeoMaquinas();

  let filasElegibles =
    0;

  let filasIgnoradas =
    0;

  let ordenesPruebaIgnoradas =
    0;

  const puestos =
    new Map<
      string,
      PuestoIgnorado
    >();

  for (
    const evento of eventos
  ) {
    const codigoMaterial =
      String(
        evento.codigoMaterial ??
        ""
      ).trim();

    /*
     * Material / orden de prueba.
     */
    if (
      codigoMaterial ===
      "10249848"
    ) {
      ordenesPruebaIgnoradas++;

      filasIgnoradas++;

      continue;
    }

    const puestoSap =
      String(
        evento.puestoTrabajo ??
        ""
      ).trim();

    const configuracion =
      mapping.get(
        puestoSap
      );

    /*
     * Puesto no configurado.
     */
    if (
      !configuracion
    ) {
      filasIgnoradas++;

      const actual =
        puestos.get(
          puestoSap
        );

      if (
        actual
      ) {
        actual.registros++;

      } else {
        puestos.set(
          puestoSap,
          {
            puestoSap:
              puestoSap ||
              "(VACIO)",

            motivo:
              "NO_CONFIGURADO",

            registros:
              1,

            maquina:
              null,

            seccion:
              null,
          }
        );
      }

      continue;
    }

    /*
     * Puesto conocido pero fuera
     * del SAP principal.
     */
    if (
      configuracion.activo !==
      1
    ) {
      filasIgnoradas++;

      const actual =
        puestos.get(
          puestoSap
        );

      if (
        actual
      ) {
        actual.registros++;

      } else {
        puestos.set(
          puestoSap,
          {
            puestoSap,

            motivo:
              "NO_INCLUIDO",

            registros:
              1,

            maquina:
              configuracion.maquina,

            seccion:
              configuracion.proceso,
          }
        );
      }

      continue;
    }

    filasElegibles++;
  }

  return {
    filasSap:
      eventos.length,

    filasElegibles,

    filasIgnoradas,

    ordenesPruebaIgnoradas,

    puestosIgnorados:
      Array.from(
        puestos.values()
      ).sort(
        (a, b) =>
          b.registros -
          a.registros
      ),
  };
}

/* =========================================================
   ALERTAS DE NEGOCIO
========================================================= */

function registrarAlertasNegocio(
  idCarga: string,
  archivoOrigen: string,
  analisis:
    AnalisisNegocio
): void {
  if (
    analisis
      .ordenesPruebaIgnoradas >
    0
  ) {
    createImportAlert({
      idCarga,

      archivoOrigen,

      nivel:
        "INFO",

      tipo:
        "ORDEN_PRUEBA_IGNORADA",

      mensaje:
        `Se ignoraron ${analisis.ordenesPruebaIgnoradas} fila(s) por corresponder al material de prueba 10249848.`,
    });
  }

  for (
    const puesto of
      analisis.puestosIgnorados
  ) {
    let mensaje:
      string;

    if (
      puesto.motivo ===
      "NO_CONFIGURADO"
    ) {
      mensaje =
        `Puesto no configurado en machine_mapping. Apareció ${puesto.registros} vez/veces y fue ignorado.`;

    } else {
      mensaje =
        `Puesto configurado pero no incluido en SAP principal. Apareció ${puesto.registros} vez/veces y fue ignorado.`;
    }

    createImportAlert({
      idCarga,

      archivoOrigen,

      nivel:
        "INFO",

      tipo:
        "PUESTO_IGNORADO",

      puestoSap:
        puesto.puestoSap,

      maquina:
        puesto.maquina,

      seccion:
        puesto.seccion,

      mensaje,
    });
  }
}

/* =========================================================
   EJECUTAR SCRIPT NPM

   Esto permite reutilizar:

   npm run export:bdd
   npm run bigquery:sync

   desde el pipeline principal.
========================================================= */

function ejecutarScriptNpm(
  script: string
): void {
  logger.info(
    {
      script,
    },
    `Ejecutando npm run ${script}`
  );

  let resultado;

  /*
   * En Windows ejecutamos npm mediante cmd.exe.
   *
   * Invocar npm.cmd directamente con spawnSync()
   * puede producir EINVAL en algunas versiones
   * recientes de Node.js.
   */
  if (
    process.platform ===
    "win32"
  ) {
    resultado =
      spawnSync(
        "cmd.exe",
        [
          "/d",
          "/s",
          "/c",
          `npm run ${script}`,
        ],
        {
          cwd:
            process.cwd(),

          stdio:
            "inherit",

          env:
            process.env,

          shell:
            false,
        }
      );

  } else {
    resultado =
      spawnSync(
        "npm",
        [
          "run",
          script,
        ],
        {
          cwd:
            process.cwd(),

          stdio:
            "inherit",

          env:
            process.env,

          shell:
            false,
        }
      );
  }

  if (
    resultado.error
  ) {
    throw new Error(
      `No fue posible ejecutar npm run ${script}: ${resultado.error.message}`
    );
  }

  if (
    resultado.status !==
    0
  ) {
    throw new Error(
      `El script npm run ${script} terminó con código ${resultado.status}.`
    );
  }

  logger.info(
    {
      script,
    },
    `Script npm run ${script} completado`
  );
}

/* =========================================================
   RESUMEN FINAL
========================================================= */

interface ResumenPipeline {
  estado:
    | "OK"
    | "ERROR";

  idCarga: string;

  archivoOrigen: string;

  desde: string;
  hasta: string;

  fechaDatosDesde:
    | string
    | null;

  fechaDatosHasta:
    | string
    | null;

  filasSap: number;

  filasElegibles: number;

  filasIgnoradas: number;

  fechasReemplazadas: number;

  eventosReemplazados: number;

  nuevos: number;

  existentes: number;

  totalEventos: number;

  alertas: number;

  bigQuery:
    | "OK"
    | "NO_EJECUTADO";
}

function mostrarResumenPipeline(
  resumen:
    ResumenPipeline
): void {
  console.log(
    "\n" +
    "=".repeat(
      95
    )
  );

  console.log(
    "RESUMEN FINAL DEL PIPELINE"
  );

  console.log(
    "=".repeat(
      95
    )
  );

  console.log(
    `Estado:               ${resumen.estado}`
  );

  console.log(
    `ID carga:             ${resumen.idCarga}`
  );

  console.log(
    `Archivo SAP:          ${resumen.archivoOrigen}`
  );

  console.log(
    `Periodo solicitado:   ${resumen.desde} -> ${resumen.hasta}`
  );

  console.log(
    `Periodo encontrado:   ${resumen.fechaDatosDesde ?? "-"} -> ${resumen.fechaDatosHasta ?? "-"}`
  );

  console.log(
    `Filas SAP:            ${resumen.filasSap}`
  );

  console.log(
    `Filas elegibles:      ${resumen.filasElegibles}`
  );

  console.log(
    `Filas ignoradas:      ${resumen.filasIgnoradas}`
  );

  console.log(
    `Fechas reemplazadas:  ${resumen.fechasReemplazadas}`
  );

  console.log(
    `Eventos reemplazados: ${resumen.eventosReemplazados}`
  );

  console.log(
    `Eventos nuevos:       ${resumen.nuevos}`
  );

  console.log(
    `Eventos existentes:   ${resumen.existentes}`
  );

  console.log(
    `Eventos en SQLite:    ${resumen.totalEventos}`
  );

  console.log(
    `Alertas registradas:  ${resumen.alertas}`
  );

  console.log(
    `BigQuery:             ${resumen.bigQuery}`
  );

  console.log(
    "=".repeat(
      95
    )
  );
}

/* =========================================================
   MAIN
========================================================= */

async function main():
Promise<void> {
  logger.info(
    "=================================="
  );

  logger.info(
    "PIPELINE CUMPLIMIENTO PRODUCCION"
  );

  logger.info(
    "=================================="
  );

  const argumentos =
    leerArgumentos();

  const periodo =
    obtenerPeriodoEfectivo(
      argumentos
    );

  if (
    argumentos.desde
  ) {
    logger.info(
      {
        desde:
          periodo.desde,

        hasta:
          periodo.hasta,
      },
      "Pipeline ejecutado con periodo personalizado"
    );

  } else {
    logger.info(
      {
        desde:
          periodo.desde,

        hasta:
          periodo.hasta,
      },
      "Pipeline ejecutado para fecha actual"
    );
  }

  const {
    context,
    page,
  } =
    await openSapBrowser();

  let idCarga:
    string | null =
    null;

  let archivoOrigen:
    string | null =
    null;

  /*
   * Evita registrar dos veces un error
   * cuando ya fue registrado explícitamente.
   */
  let errorYaRegistrado =
    false;

  /*
   * Después de que SAP/SQLite quedan OK,
   * no debemos cambiar import_runs a ERROR
   * si solamente falla una etapa BI.
   */
  let cargaSapFinalizada =
    false;

  try {
    /* =====================================================
       ETAPA 1/7
       SAP
    ===================================================== */

    logger.info(
      "ETAPA 1/7 - Extraccion SAP"
    );

    await loginSap(
      page
    );

    await openZpp10i(
      page
    );

    await openRecorrido(
      page
    );

    await completarParametrosRecorrido(
      page,
      {
        desde:
          argumentos.desde,

        hasta:
          argumentos.hasta,
      }
    );

    await ejecutarRecorrido(
      page
    );

    const rawPath =
      await exportarRecorrido(
        page
      );

    archivoOrigen =
      path.basename(
        rawPath
      );

    idCarga =
      startImportRun({
        archivoOrigen,

        fechaSolicitadaDesde:
          periodo.desde,

        fechaSolicitadaHasta:
          periodo.hasta,

        fuente:
          "SAP_PRINCIPAL",
      });

    logger.info(
      {
        rawPath,
        idCarga,
      },
      "Extraccion SAP completada"
    );

    /*
     * Ya no necesitamos SAP después
     * de obtener el RAW.
     */
    await context.close();

    /* =====================================================
       ETAPA 2/7
       RAW -> STAGING
    ===================================================== */

    logger.info(
      "ETAPA 2/7 - RAW a STAGING"
    );

    const stagingPath =
      await procesarRawSap(
        rawPath
      );

    /* =====================================================
       ETAPA 3/7
       STAGING -> PROCESSED
    ===================================================== */

    logger.info(
      "ETAPA 3/7 - STAGING a PROCESSED"
    );

    const processedPath =
      await procesarStaging(
        stagingPath
      );

    /* =====================================================
       ETAPA 4/7
       VALIDACIONES
    ===================================================== */

    logger.info(
      "ETAPA 4/7 - Validacion de periodo y negocio"
    );

    const eventos =
      leerEventosProcessed(
        processedPath
      );

    const fechas =
      eventos.map(
        (
          evento
        ) =>
          evento.fechaReporte
      );

    const validacionPeriodo =
      validatePeriod({
        fechas,

        desde:
          periodo.desde,

        hasta:
          periodo.hasta,
      });

    /*
     * =====================================================
     * RECHAZO TOTAL ANTES DE SQLITE
     * =====================================================
     */

    if (
      !validacionPeriodo.valido
    ) {
      const mensaje =
        `Carga rechazada por periodo. ${validacionPeriodo.mensaje}`;

      createImportAlert({
        idCarga,

        archivoOrigen,

        nivel:
          "ERROR",

        tipo:
          "PERIODO_INVALIDO",

        mensaje,
      });

      finishImportRun({
        idCarga,

        estado:
          "ERROR",

        filasSap:
          eventos.length,

        filasProcesadas:
          0,

        filasIgnoradas:
          eventos.length,

        fechaDatosDesde:
          validacionPeriodo
            .fechaMinima,

        fechaDatosHasta:
          validacionPeriodo
            .fechaMaxima,

        mensaje,
      });

      errorYaRegistrado =
        true;

      throw new Error(
        mensaje
      );
    }

    /*
     * Validación correcta.
     */
    createImportAlert({
      idCarga,

      archivoOrigen,

      nivel:
        "INFO",

      tipo:
        "VALIDACION_OK",

      mensaje:
        `Periodo validado correctamente. Datos: ${validacionPeriodo.fechaMinima} -> ${validacionPeriodo.fechaMaxima}.`,
    });

    const analisisNegocio =
      analizarEventosNegocio(
        eventos
      );

    registrarAlertasNegocio(
      idCarga,
      archivoOrigen,
      analisisNegocio
    );

    logger.info(
      {
        filasSap:
          analisisNegocio
            .filasSap,

        filasElegibles:
          analisisNegocio
            .filasElegibles,

        filasIgnoradas:
          analisisNegocio
            .filasIgnoradas,

        ordenesPrueba:
          analisisNegocio
            .ordenesPruebaIgnoradas,

        puestosIgnorados:
          analisisNegocio
            .puestosIgnorados
            .length,
      },
      "Validacion de negocio completada"
    );

    /* =====================================================
       ETAPA 5/7
       SQLITE
    ===================================================== */

    logger.info(
      "ETAPA 5/7 - SQLite"
    );

    const resultado =
      await ingerirProcessed(
        processedPath
      );

    createImportAlert({
      idCarga,

      archivoOrigen,

      nivel:
        "INFO",

      tipo:
        "ARCHIVO_PROCESADO",

      mensaje:
        `Archivo procesado correctamente. Fechas reemplazadas: ${resultado.fechasReemplazadas}. Eventos reemplazados: ${resultado.reemplazados}. Nuevos: ${resultado.nuevos}. Existentes: ${resultado.existentes}.`,
    });

    /*
     * =====================================================
     * A partir de este punto la carga SAP/SQLite
     * ya puede considerarse exitosa.
     * =====================================================
     */

    finishImportRun({
      idCarga,

      estado:
        "OK",

      filasSap:
        analisisNegocio
          .filasSap,

      /*
       * Todos los eventos técnicamente
       * válidos quedan conservados en events.
       *
       * filasIgnoradas se refiere únicamente
       * a exclusión del cálculo productivo.
       */
      filasProcesadas:
        analisisNegocio
          .filasSap,

      filasIgnoradas:
        analisisNegocio
          .filasIgnoradas,

      fechaDatosDesde:
        validacionPeriodo
          .fechaMinima,

      fechaDatosHasta:
        validacionPeriodo
          .fechaMaxima,

      mensaje:
        "Carga SAP validada y procesada correctamente.",
    });

    cargaSapFinalizada =
      true;

    /*
     * Si una etapa BI falla después,
     * NO debe convertir esta carga SAP
     * en ERROR.
     */
    errorYaRegistrado =
      true;

    /* =====================================================
       MODO --solo-sap

       El proceso maestro mensual necesita que este pipeline
       termine justo después de SAP -> SQLite.

       Export BDD y BigQuery se ejecutarán DESPUÉS de integrar
       Drive/Bolsera y reconstruir las vistas, evitando:
       - sincronización prematura;
       - duplicación de etapas;
       - snapshot de BigQuery sin Bolsera.
    ===================================================== */

    if (
      argumentos.soloSap
    ) {
      const totalAlertasRow =
        db.prepare(`
          SELECT
            COUNT(*) AS total

          FROM
            import_alerts

          WHERE
            id_carga = ?
        `)
          .get(
            idCarga
          ) as {
            total: number;
          };

      mostrarResumenPipeline({
        estado:
          "OK",

        idCarga,

        archivoOrigen,

        desde:
          periodo.desde,

        hasta:
          periodo.hasta,

        fechaDatosDesde:
          validacionPeriodo
            .fechaMinima,

        fechaDatosHasta:
          validacionPeriodo
            .fechaMaxima,

        filasSap:
          analisisNegocio
            .filasSap,

        filasElegibles:
          analisisNegocio
            .filasElegibles,

        filasIgnoradas:
          analisisNegocio
            .filasIgnoradas,

        fechasReemplazadas:
          resultado
            .fechasReemplazadas,

        eventosReemplazados:
          resultado
            .reemplazados,

        nuevos:
          resultado.nuevos,

        existentes:
          resultado.existentes,

        totalEventos:
          resultado.totalEventos,

        alertas:
          totalAlertasRow
            .total,

        bigQuery:
          "NO_EJECUTADO",
      });

      logger.info(
        {
          idCarga,
          desde:
            periodo.desde,
          hasta:
            periodo.hasta,
        },
        "PIPELINE SAP/SQLITE COMPLETADO - modo --solo-sap"
      );

      return;
    }

    /* =====================================================
       ETAPA 6/7
       EXPORTAR BDD NORMALIZADA
    ===================================================== */

    logger.info(
      "ETAPA 6/7 - Exportacion BDD normalizada"
    );

    /*
     * v_bdd_normalizada es una VIEW.
     *
     * Al actualizar events en SQLite,
     * refleja automáticamente los datos
     * actualizados.
     */
    ejecutarScriptNpm(
      "export:bdd"
    );

    logger.info(
      "Exportacion BDD completada"
    );

    /* =====================================================
       ETAPA 7/7
       BIGQUERY
    ===================================================== */

    logger.info(
      "ETAPA 7/7 - Sincronizacion BigQuery"
    );

    ejecutarScriptNpm(
      "bigquery:sync"
    );

    logger.info(
      "Sincronizacion BigQuery completada"
    );

    /* =====================================================
       ALERTAS / RESUMEN
    ===================================================== */

    const totalAlertasRow =
      db.prepare(`
        SELECT
          COUNT(*) AS total

        FROM
          import_alerts

        WHERE
          id_carga = ?
      `)
      .get(
        idCarga
      ) as {
        total: number;
      };

    mostrarResumenPipeline({
      estado:
        "OK",

      idCarga,

      archivoOrigen,

      desde:
        periodo.desde,

      hasta:
        periodo.hasta,

      fechaDatosDesde:
        validacionPeriodo
          .fechaMinima,

      fechaDatosHasta:
        validacionPeriodo
          .fechaMaxima,

      filasSap:
        analisisNegocio
          .filasSap,

      filasElegibles:
        analisisNegocio
          .filasElegibles,

      filasIgnoradas:
        analisisNegocio
          .filasIgnoradas,

      fechasReemplazadas:
        resultado
          .fechasReemplazadas,

      eventosReemplazados:
        resultado
          .reemplazados,

      nuevos:
        resultado.nuevos,

      existentes:
        resultado.existentes,

      totalEventos:
        resultado.totalEventos,

      alertas:
        totalAlertasRow
          .total,

      bigQuery:
        "OK",
    });

    logger.info(
      {
        idCarga,

        nuevos:
          resultado.nuevos,

        existentes:
          resultado.existentes,

        reemplazados:
          resultado.reemplazados,

        fechasReemplazadas:
          resultado
            .fechasReemplazadas,

        totalEventos:
          resultado.totalEventos,

        syncId:
          resultado.syncId,

        bigQuery:
          "OK",
      },
      "Resultado final del pipeline"
    );

    logger.info(
      "=================================="
    );

    logger.info(
      "PIPELINE COMPLETADO CORRECTAMENTE"
    );

    logger.info(
      "=================================="
    );

  } catch (
    error
  ) {
    /*
     * Puede estar cerrado desde la
     * finalización de la etapa SAP.
     */
    try {
      await context.close();

    } catch {
      // Ya estaba cerrado.
    }

    /*
     * Si SAP/SQLite TODAVÍA NO había
     * finalizado correctamente,
     * registramos el error en import_runs.
     */
    if (
      idCarga &&
      !errorYaRegistrado &&
      !cargaSapFinalizada
    ) {
      try {
        failImportRun(
          idCarga,
          error,
          archivoOrigen
        );

      } catch (
        controlError
      ) {
        logger.error(
          controlError,
          "No fue posible registrar el error en import_runs"
        );
      }
    }

    /*
     * Si SQLite ya terminó OK pero falló
     * export:bdd o BigQuery, dejamos claro
     * que el problema es downstream.
     */
    if (
      cargaSapFinalizada
    ) {
      logger.error(
        {
          idCarga,
        },
        "La carga SAP/SQLite terminó correctamente, pero falló una etapa posterior de BI"
      );
    }

    logger.error(
      error,
      "Fallo pipeline de cumplimiento"
    );

    throw error;
  }
}

main().catch(
  (
    error
  ) => {
    logger.error(
      error,
      "Error fatal del pipeline"
    );

    process.exit(
      1
    );
  }
);