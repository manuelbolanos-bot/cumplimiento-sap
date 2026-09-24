import fs from "node:fs/promises";
import path from "node:path";

import {
  logger,
} from "../utils/logger.js";

interface ArchivoEncontrado {
  path: string;
  mtimeMs: number;
}

export async function encontrarUltimoStaging():
Promise<string> {
  const directorio =
    path.resolve(
      process.cwd(),
      "data",
      "staging"
    );

  logger.info(
    {
      directorio,
    },
    "Buscando último STAGING"
  );

  const entradas =
    await fs.readdir(
      directorio,
      {
        withFileTypes: true,
      }
    );

  const archivos:
    ArchivoEncontrado[] = [];

  for (
    const entrada of entradas
  ) {
    if (
      !entrada.isFile()
    ) {
      continue;
    }

    if (
      !entrada.name
        .toLowerCase()
        .endsWith(".json")
    ) {
      continue;
    }

    const ruta =
      path.join(
        directorio,
        entrada.name
      );

    const stat =
      await fs.stat(
        ruta
      );

    archivos.push({
      path: ruta,
      mtimeMs:
        stat.mtimeMs,
    });
  }

  if (
    archivos.length === 0
  ) {
    throw new Error(
      "No existen archivos STAGING."
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
    "Último STAGING encontrado"
  );

  return ultimo;
}