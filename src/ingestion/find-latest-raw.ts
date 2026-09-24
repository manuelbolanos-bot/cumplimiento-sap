import fs from "node:fs/promises";
import path from "node:path";

import { logger } from "../utils/logger.js";

interface ArchivoEncontrado {
  path: string;
  mtimeMs: number;
}

async function recorrerDirectorio(
  directorio: string
): Promise<ArchivoEncontrado[]> {
  const encontrados:
    ArchivoEncontrado[] = [];

  const entradas =
    await fs.readdir(
      directorio,
      {
        withFileTypes: true,
      }
    );

  for (const entrada of entradas) {
    const ruta = path.join(
      directorio,
      entrada.name
    );

    if (entrada.isDirectory()) {
      const internos =
        await recorrerDirectorio(
          ruta
        );

      encontrados.push(
        ...internos
      );

      continue;
    }

    if (
      !entrada.name
        .toLowerCase()
        .endsWith(".xlsx")
    ) {
      continue;
    }

    const stat =
      await fs.stat(ruta);

    encontrados.push({
      path: ruta,
      mtimeMs:
        stat.mtimeMs,
    });
  }

  return encontrados;
}

export async function encontrarUltimoRawSap():
Promise<string> {
  const rawRoot =
    path.resolve(
      process.cwd(),
      "data",
      "raw",
      "sap"
    );

  logger.info(
    {
      rawRoot,
    },
    "Buscando último RAW SAP"
  );

  const archivos =
    await recorrerDirectorio(
      rawRoot
    );

  if (archivos.length === 0) {
    throw new Error(
      "No existen archivos RAW SAP."
    );
  }

  archivos.sort(
    (a, b) =>
      b.mtimeMs -
      a.mtimeMs
  );

  const ultimo =
    archivos[0].path;

  logger.info(
    {
      archivo:
        ultimo,
    },
    "Último RAW SAP encontrado"
  );

  return ultimo;
}