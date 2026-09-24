import path from "node:path";

import * as XLSX from "xlsx";

import { logger } from "../utils/logger.js";

import {
  EventoProduccion,
} from "./types.js";

import {
  sapDateToIso,
  toNullableNumber,
  toNumber,
  toSapPedido,
  toText,
} from "./normalizers.js";

/*
 * El reporte actual de ZPP10I contiene
 * 18 columnas útiles.
 */
const TOTAL_COLUMNAS_ESPERADAS = 18;

/*
 * Estos encabezados nos permiten identificar
 * inequívocamente dónde empieza la tabla real.
 *
 * SAP coloca antes filas como:
 *
 * Reporte de Recorrido
 * Sociedad :0135 -ROTOFLEX
 * (DATOS)
 */
const ENCABEZADOS_CLAVE = [
  "Orden",
  "Operador",
  "Turno",
  "Cod. Mat.",
  "Pedido",
  "Posición",
  "Nombre de Material",
  "Fec.Report",
];

export interface ResultadoLecturaSap {
  columnas: string[];
  registros: EventoProduccion[];

  /*
   * Guardaremos también en qué fila Excel
   * encontramos realmente los encabezados.
   *
   * Es útil para auditoría y diagnóstico.
   */
  filaEncabezados: number;
}

/* =========================================================
   IDENTIFICAR FILA DE ENCABEZADOS
========================================================= */

function encontrarFilaEncabezados(
  matriz: unknown[][]
): number {
  /*
   * No asumimos que el encabezado esté
   * en una posición fija.
   *
   * Recorremos las primeras filas del archivo
   * buscando la secuencia conocida.
   */
  const limite = Math.min(
    matriz.length,
    50
  );

  for (
    let rowIndex = 0;
    rowIndex < limite;
    rowIndex++
  ) {
    const fila = matriz[rowIndex];

    const valores = fila.map(
      (value) => toText(value)
    );

    let coincide = true;

    for (
      let columnIndex = 0;
      columnIndex <
      ENCABEZADOS_CLAVE.length;
      columnIndex++
    ) {
      const esperado =
        ENCABEZADOS_CLAVE[
          columnIndex
        ];

      const actual =
        valores[
          columnIndex
        ] ?? "";

      if (
        actual.trim() !== esperado
      ) {
        coincide = false;
        break;
      }
    }

    if (coincide) {
      /*
       * rowIndex es base 0.
       * Excel visualmente empieza en fila 1.
       */
      const filaExcel =
        rowIndex + 1;

      logger.info(
        {
          indiceMatriz:
            rowIndex,

          filaExcel,
        },
        "Fila real de encabezados SAP encontrada"
      );

      return rowIndex;
    }
  }

  throw new Error(
    "No se encontró la fila de encabezados del Reporte de Recorrido."
  );
}

/* =========================================================
   VALIDAR ENCABEZADOS
========================================================= */

function validarEncabezados(
  encabezados: string[]
): void {
  logger.info(
    {
      cantidad:
        encabezados.length,

      encabezados,
    },
    "Encabezados SAP detectados"
  );

  /*
   * Puede haber columnas vacías sobrantes en Excel.
   *
   * Por eso nos interesan las primeras 18
   * columnas estructurales.
   */
  if (
    encabezados.length <
    TOTAL_COLUMNAS_ESPERADAS
  ) {
    throw new Error(
      `Estructura SAP inesperada. ` +
      `Se esperaban al menos ${TOTAL_COLUMNAS_ESPERADAS} columnas ` +
      `y se encontraron ${encabezados.length}.`
    );
  }

  for (
    let i = 0;
    i <
    ENCABEZADOS_CLAVE.length;
    i++
  ) {
    const esperado =
      ENCABEZADOS_CLAVE[i];

    const actual =
      encabezados[i] ?? "";

    if (
      actual.trim() !==
      esperado
    ) {
      throw new Error(
        `Columna SAP inesperada en posición ${i + 1}. ` +
        `Esperado="${esperado}", Actual="${actual}"`
      );
    }
  }

  logger.info(
    "Estructura principal del XLSX validada"
  );
}

/* =========================================================
   CONVERTIR FILA SAP
========================================================= */

function convertirFila(
  fila: unknown[]
): EventoProduccion {
  const fechaOriginal =
    toText(fila[7]);

  return {
    /*
     * 0 - Orden
     */
    orden:
      toText(fila[0]),

    /*
     * 1 - Operador
     */
    operador:
      toText(fila[1]),

    /*
     * 2 - Turno
     */
    turno:
      toNullableNumber(
        fila[2]
      ),

    /*
     * 3 - Cod. Mat.
     */
    codigoMaterial:
      toText(fila[3]),

    /*
     * 4 - Pedido
     */
    pedido:
        toSapPedido(
        fila[4]
    ),

    /*
     * 5 - Posición
     */
    posicion:
      toNullableNumber(
        fila[5]
      ),

    /*
     * 6 - Nombre de Material
     */
    nombreMaterial:
      toText(fila[6]),

    /*
     * 7 - Fec.Report
     */
    fechaReporte:
      sapDateToIso(
        fechaOriginal
      ),

    fechaReporteOriginal:
      fechaOriginal,

    /*
     * 8 - Puesto de Trabajo
     */
    puestoTrabajo:
      toText(fila[8]),

    /*
     * 9 - Horas
     */
    horas:
      toNumber(
        fila[9]
      ),

    /*
     * 10 - Cantidad de operación
     */
    cantidadOperacion:
      toNumber(
        fila[10]
      ),

    /*
     * 11 - U/M operación
     */
    unidadOperacion:
      toText(
        fila[11]
      ),

    /*
     * 12 - Cantidad Notificada
     */
    cantidadNotificada:
      toNumber(
        fila[12]
      ),

    /*
     * 13 - U/M notificada
     */
    unidadNotificada:
      toText(
        fila[13]
      ),

    /*
     * 14 - Cantidad en Metros
     */
    cantidadMetros:
      toNumber(
        fila[14]
      ),

    /*
     * 15 - U/M metros
     */
    unidadMetros:
      toText(
        fila[15]
      ),

    /*
     * 16 - Desperdicio
     */
    desperdicio:
      toNumber(
        fila[16]
      ),

    /*
     * 17 - U/M desperdicio
     */
    unidadDesperdicio:
      toText(
        fila[17]
      ),
  };
}

/* =========================================================
   LEER ARCHIVO SAP
========================================================= */

export function leerArchivoSap(
  archivo: string
): ResultadoLecturaSap {
  logger.info(
    {
      archivo,
    },
    "Leyendo XLSX SAP"
  );

  const workbook =
    XLSX.readFile(
      archivo,
      {
        /*
         * Queremos controlar nosotros
         * la transformación de fechas.
         */
        cellDates: false,

        /*
         * Conservamos formato mostrado por Excel/SAP.
         */
        raw: false,
      }
    );

  /* ======================================================
     VALIDAR HOJA DATA
  ====================================================== */

  if (
    !workbook.SheetNames.includes(
      "Data"
    )
  ) {
    throw new Error(
      `El archivo ${path.basename(
        archivo
      )} no contiene la hoja Data.`
    );
  }

  logger.info(
    {
      hojas:
        workbook.SheetNames,
    },
    "Libro Excel abierto correctamente"
  );

  const sheet =
    workbook.Sheets["Data"];

  /* ======================================================
     CONVERTIR TODA LA HOJA EN MATRIZ
  ====================================================== */

  const matriz =
    XLSX.utils.sheet_to_json<
      unknown[]
    >(
      sheet,
      {
        /*
         * header: 1 significa:
         *
         * devolver cada fila como array.
         *
         * Esto es fundamental porque SAP
         * tiene varios encabezados repetidos:
         *
         * U/M
         * U/M
         * U/M
         */
        header: 1,

        defval: "",

        raw: false,

        /*
         * No descartamos filas vacías automáticamente.
         * Primero debemos encontrar la cabecera.
         */
        blankrows: true,
      }
    );

  if (
    matriz.length === 0
  ) {
    throw new Error(
      "La hoja Data está vacía."
    );
  }

  logger.info(
    {
      filasTotalesExcel:
        matriz.length,
    },
    "Contenido bruto de hoja Data cargado"
  );

  /* ======================================================
     ENCONTRAR ENCABEZADOS REALES
  ====================================================== */

  const indiceEncabezados =
    encontrarFilaEncabezados(
      matriz
    );

  const filaEncabezados =
    indiceEncabezados + 1;

  /*
   * Nos quedamos solamente con las
   * primeras 18 columnas conocidas.
   */
  const encabezados =
    matriz[
      indiceEncabezados
    ]
      .slice(
        0,
        TOTAL_COLUMNAS_ESPERADAS
      )
      .map(
        (value) =>
          toText(value)
      );

  validarEncabezados(
    encabezados
  );

  /* ======================================================
     OBTENER FILAS DE DATOS
  ====================================================== */

  const filas =
    matriz.slice(
      indiceEncabezados + 1
    );

  /*
   * Quitamos filas totalmente vacías.
   */
  const filasConDatos =
    filas.filter(
      (fila) => {
        const primerasColumnas =
          fila.slice(
            0,
            TOTAL_COLUMNAS_ESPERADAS
          );

        return primerasColumnas.some(
          (value) =>
            toText(value) !== ""
        );
      }
    );

  logger.info(
    {
      filasPosterioresAlEncabezado:
        filas.length,

      filasConDatos:
        filasConDatos.length,
    },
    "Filas SAP detectadas"
  );

  /* ======================================================
     NORMALIZAR FILAS
  ====================================================== */

  const registros =
    filasConDatos.map(
      (fila) =>
        convertirFila(
          fila.slice(
            0,
            TOTAL_COLUMNAS_ESPERADAS
          )
        )
    );

  logger.info(
    {
      registros:
        registros.length,
    },
    "Registros SAP normalizados"
  );

  return {
    columnas:
      encabezados,

    registros,

    filaEncabezados,
  };
}