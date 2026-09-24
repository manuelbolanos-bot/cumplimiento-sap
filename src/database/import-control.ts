import crypto from "node:crypto";

import { db } from "./db.js";

/* =========================================================
   TIPOS
========================================================= */

export type ImportStatus =
  | "RUNNING"
  | "OK"
  | "ERROR";

export type AlertLevel =
  | "INFO"
  | "WARNING"
  | "ERROR";

export type AlertType =
  | "PUESTO_IGNORADO"
  | "ORDEN_PRUEBA_IGNORADA"
  | "PERIODO_INVALIDO"
  | "ERROR_GENERAL"
  | "ARCHIVO_PROCESADO"
  | "SIN_DATOS"
  | "VALIDACION_OK";

export interface StartImportRunInput {
  archivoOrigen: string;

  fechaSolicitadaDesde?: string | null;
  fechaSolicitadaHasta?: string | null;

  fuente?: string;
}

export interface FinishImportRunInput {
  idCarga: string;

  estado: "OK" | "ERROR";

  filasSap?: number;
  filasProcesadas?: number;
  filasIgnoradas?: number;

  fechaDatosDesde?: string | null;
  fechaDatosHasta?: string | null;

  mensaje?: string | null;
}

export interface CreateImportAlertInput {
  idCarga: string;

  archivoOrigen?: string | null;

  nivel: AlertLevel;
  tipo: AlertType;

  fecha?: string | null;

  puestoSap?: string | null;
  maquina?: string | null;
  seccion?: string | null;

  mensaje: string;
}

/* =========================================================
   SCHEMA
========================================================= */

export function ensureImportControlSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS import_runs (
      id_carga TEXT PRIMARY KEY,

      fuente TEXT NOT NULL DEFAULT 'SAP_PRINCIPAL',

      archivo_origen TEXT NOT NULL,

      estado TEXT NOT NULL
        CHECK (
          estado IN (
            'RUNNING',
            'OK',
            'ERROR'
          )
        ),

      fecha_inicio TEXT NOT NULL,
      fecha_fin TEXT,

      fecha_solicitada_desde TEXT,
      fecha_solicitada_hasta TEXT,

      fecha_datos_desde TEXT,
      fecha_datos_hasta TEXT,

      filas_sap INTEGER NOT NULL DEFAULT 0,
      filas_procesadas INTEGER NOT NULL DEFAULT 0,
      filas_ignoradas INTEGER NOT NULL DEFAULT 0,

      mensaje TEXT,

      created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS
      idx_import_runs_estado
      ON import_runs (
        estado
      );

    CREATE INDEX IF NOT EXISTS
      idx_import_runs_fecha_inicio
      ON import_runs (
        fecha_inicio
      );

    CREATE INDEX IF NOT EXISTS
      idx_import_runs_archivo
      ON import_runs (
        archivo_origen
      );


    CREATE TABLE IF NOT EXISTS import_alerts (
      id_alerta TEXT PRIMARY KEY,

      id_carga TEXT NOT NULL,

      archivo_origen TEXT,

      fecha_alerta TEXT NOT NULL,

      nivel TEXT NOT NULL
        CHECK (
          nivel IN (
            'INFO',
            'WARNING',
            'ERROR'
          )
        ),

      tipo_alerta TEXT NOT NULL,

      fecha TEXT,

      puesto_sap TEXT,
      maquina TEXT,
      seccion TEXT,

      mensaje TEXT NOT NULL,

      created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        id_carga
      )
      REFERENCES import_runs (
        id_carga
      )
      ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS
      idx_import_alerts_carga
      ON import_alerts (
        id_carga
      );

    CREATE INDEX IF NOT EXISTS
      idx_import_alerts_tipo
      ON import_alerts (
        tipo_alerta
      );

    CREATE INDEX IF NOT EXISTS
      idx_import_alerts_nivel
      ON import_alerts (
        nivel
      );
  `);
}

/* =========================================================
   HELPERS
========================================================= */

function nowIso(): string {
  return new Date().toISOString();
}

function createId(
  prefix: string
): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/* =========================================================
   INICIAR CARGA
========================================================= */

export function startImportRun(
  input: StartImportRunInput
): string {
  ensureImportControlSchema();

  const idCarga =
    createId("load");

  const fechaInicio =
    nowIso();

  db.prepare(`
    INSERT INTO import_runs (
      id_carga,
      fuente,
      archivo_origen,
      estado,

      fecha_inicio,

      fecha_solicitada_desde,
      fecha_solicitada_hasta,

      filas_sap,
      filas_procesadas,
      filas_ignoradas,

      created_at,
      updated_at
    )
    VALUES (
      @idCarga,
      @fuente,
      @archivoOrigen,
      'RUNNING',

      @fechaInicio,

      @fechaSolicitadaDesde,
      @fechaSolicitadaHasta,

      0,
      0,
      0,

      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `).run({
    idCarga,

    fuente:
      input.fuente ??
      "SAP_PRINCIPAL",

    archivoOrigen:
      input.archivoOrigen,

    fechaInicio,

    fechaSolicitadaDesde:
      input.fechaSolicitadaDesde ??
      null,

    fechaSolicitadaHasta:
      input.fechaSolicitadaHasta ??
      null,
  });

  return idCarga;
}

/* =========================================================
   FINALIZAR CARGA
========================================================= */

export function finishImportRun(
  input: FinishImportRunInput
): void {
  ensureImportControlSchema();

  db.prepare(`
    UPDATE import_runs

    SET
      estado =
        @estado,

      fecha_fin =
        @fechaFin,

      fecha_datos_desde =
        @fechaDatosDesde,

      fecha_datos_hasta =
        @fechaDatosHasta,

      filas_sap =
        @filasSap,

      filas_procesadas =
        @filasProcesadas,

      filas_ignoradas =
        @filasIgnoradas,

      mensaje =
        @mensaje,

      updated_at =
        CURRENT_TIMESTAMP

    WHERE
      id_carga =
      @idCarga
  `).run({
    idCarga:
      input.idCarga,

    estado:
      input.estado,

    fechaFin:
      nowIso(),

    fechaDatosDesde:
      input.fechaDatosDesde ??
      null,

    fechaDatosHasta:
      input.fechaDatosHasta ??
      null,

    filasSap:
      input.filasSap ??
      0,

    filasProcesadas:
      input.filasProcesadas ??
      0,

    filasIgnoradas:
      input.filasIgnoradas ??
      0,

    mensaje:
      input.mensaje ??
      null,
  });
}

/* =========================================================
   ALERTAS
========================================================= */

export function createImportAlert(
  input: CreateImportAlertInput
): string {
  ensureImportControlSchema();

  const idAlerta =
    createId("alert");

  db.prepare(`
    INSERT INTO import_alerts (
      id_alerta,
      id_carga,

      archivo_origen,

      fecha_alerta,

      nivel,
      tipo_alerta,

      fecha,

      puesto_sap,
      maquina,
      seccion,

      mensaje,

      created_at
    )
    VALUES (
      @idAlerta,
      @idCarga,

      @archivoOrigen,

      @fechaAlerta,

      @nivel,
      @tipo,

      @fecha,

      @puestoSap,
      @maquina,
      @seccion,

      @mensaje,

      CURRENT_TIMESTAMP
    )
  `).run({
    idAlerta,

    idCarga:
      input.idCarga,

    archivoOrigen:
      input.archivoOrigen ??
      null,

    fechaAlerta:
      nowIso(),

    nivel:
      input.nivel,

    tipo:
      input.tipo,

    fecha:
      input.fecha ??
      null,

    puestoSap:
      input.puestoSap ??
      null,

    maquina:
      input.maquina ??
      null,

    seccion:
      input.seccion ??
      null,

    mensaje:
      input.mensaje,
  });

  return idAlerta;
}

/* =========================================================
   ERROR GENERAL

   Helper para no repetir lógica en catch().
========================================================= */

export function failImportRun(
  idCarga: string,
  error: unknown,
  archivoOrigen?: string | null
): void {
  const mensaje =
    error instanceof Error
      ? error.message
      : String(error);

  createImportAlert({
    idCarga,

    archivoOrigen:
      archivoOrigen ??
      null,

    nivel:
      "ERROR",

    tipo:
      "ERROR_GENERAL",

    mensaje,
  });

  finishImportRun({
    idCarga,

    estado:
      "ERROR",

    mensaje,
  });
}