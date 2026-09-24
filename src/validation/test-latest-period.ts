import fs from "node:fs";
import path from "node:path";

import { logger } from "../utils/logger.js";

import {
  validatePeriod,
} from "./validate-period.js";

interface EventoProcesado {
  fechaReporte?: string;
}

/* =========================================================
   ARGUMENTOS CLI
========================================================= */

function getArg(
  name: string
): string | null {
  const prefix =
    `--${name}=`;

  const arg =
    process.argv.find(
      (item) =>
        item.startsWith(
          prefix
        )
    );

  if (!arg) {
    return null;
  }

  return arg.substring(
    prefix.length
  );
}

/* =========================================================
   BUSQUEDA RECURSIVA DE JSON
========================================================= */

function buscarJsons(
  dir: string
): string[] {
  if (
    !fs.existsSync(
      dir
    )
  ) {
    return [];
  }

  const resultados:
    string[] = [];

  const entries =
    fs.readdirSync(
      dir,
      {
        withFileTypes:
          true,
      }
    );

  for (
    const entry of entries
  ) {
    const full =
      path.join(
        dir,
        entry.name
      );

    if (
      entry.isDirectory()
    ) {
      resultados.push(
        ...buscarJsons(
          full
        )
      );

      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith(
        ".json"
      )
    ) {
      resultados.push(
        full
      );
    }
  }

  return resultados;
}

/* =========================================================
   SELECCION DEL ULTIMO PROCESADO
========================================================= */

function encontrarUltimoProcesado():
string {
  /*
   * Estructura real actual:
   *
   * data/
   * └── processed/
   *     ├── SAP_....processed.json
   *     └── ...
   */
  const base =
    path.resolve(
      "data/processed"
    );

  const files =
    buscarJsons(
      base
    );

  if (
    files.length ===
    0
  ) {
    throw new Error(
      "No se encontraron archivos JSON dentro de data/processed."
    );
  }

  /*
   * Primero preferimos archivos
   * explícitamente .processed.json
   */
  const processed =
    files.filter(
      (file) =>
        file.endsWith(
          ".processed.json"
        )
    );

  const candidatos =
    processed.length > 0
      ? processed
      : files;

  /*
   * Ordenamos por última modificación.
   */
  candidatos.sort(
    (a, b) => {
      const statA =
        fs.statSync(
          a
        );

      const statB =
        fs.statSync(
          b
        );

      return (
        statB.mtimeMs -
        statA.mtimeMs
      );
    }
  );

  return candidatos[0];
}

/* =========================================================
   LEER EVENTOS DEL JSON
========================================================= */

function leerEventos(
  file: string
): EventoProcesado[] {
  const raw =
    fs.readFileSync(
      file,
      "utf8"
    );

  const contenido =
    JSON.parse(
      raw
    );

  /*
   * Soportamos varias estructuras
   * por compatibilidad.
   */
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
    "No se encontró un arreglo de eventos dentro del JSON procesado."
  );
}

/* =========================================================
   MAIN
========================================================= */

function main(): void {
  const desde =
    getArg(
      "desde"
    );

  const hasta =
    getArg(
      "hasta"
    );

  if (
    !desde ||
    !hasta
  ) {
    throw new Error(
      "Debes ejecutar el comando con --desde=YYYY-MM-DD --hasta=YYYY-MM-DD"
    );
  }

  logger.info(
    "=================================="
  );

  logger.info(
    "VALIDANDO PERIODO"
  );

  logger.info(
    "=================================="
  );

  const file =
    encontrarUltimoProcesado();

  const eventos =
    leerEventos(
      file
    );

  const fechas =
    eventos.map(
      (evento) =>
        evento.fechaReporte
    );

  const resultado =
    validatePeriod({
      fechas,
      desde,
      hasta,
    });

  console.log(
    "\nARCHIVO SELECCIONADO"
  );

  console.log(
    "-".repeat(
      80
    )
  );

  console.log(
    file
  );

  console.log(
    "\nRANGO SOLICITADO"
  );

  console.log(
    "-".repeat(
      80
    )
  );

  console.log(
    `${desde} -> ${hasta}`
  );

  console.log(
    "\nRESULTADO"
  );

  console.log(
    "-".repeat(
      80
    )
  );

  console.log(
    `Valido:              ${
      resultado.valido
        ? "SI"
        : "NO"
    }`
  );

  console.log(
    `Total registros:     ${
      resultado.totalFechas
    }`
  );

  console.log(
    `Fechas validas:      ${
      resultado.fechasValidas
    }`
  );

  console.log(
    `Fechas invalidas:    ${
      resultado.fechasInvalidas
    }`
  );

  console.log(
    `Fecha minima:        ${
      resultado.fechaMinima ??
      "-"
    }`
  );

  console.log(
    `Fecha maxima:        ${
      resultado.fechaMaxima ??
      "-"
    }`
  );

  console.log(
    `Fuera de rango:      ${
      resultado.fueraDeRango
        .length
    }`
  );

  if (
    resultado.fueraDeRango
      .length > 0
  ) {
    console.log(
      `Fechas fuera rango: ${
        resultado.fueraDeRango
          .join(
            ", "
          )
      }`
    );
  }

  if (
    resultado.fechasNoValidas
      .length > 0
  ) {
    console.log(
      `Fechas no validas:  ${
        resultado.fechasNoValidas
          .join(
            ", "
          )
      }`
    );
  }

  console.log(
    `Mensaje:             ${
      resultado.mensaje
    }`
  );

  console.log(
    "-".repeat(
      80
    )
  );

  logger.info(
    {
      archivo:
        path.basename(
          file
        ),

      valido:
        resultado.valido,

      fechaMinima:
        resultado.fechaMinima,

      fechaMaxima:
        resultado.fechaMaxima,

      registros:
        resultado.totalFechas,
    },
    "Validacion de periodo completada"
  );

  /*
   * Esto permite que el pipeline futuro
   * detecte fallo por exit code.
   */
  if (
    !resultado.valido
  ) {
    process.exitCode =
      1;
  }
}

main();