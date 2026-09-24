import { db } from "./db.js";

export interface CrearSyncRun {
  archivoProcessed: string;

  startedAt: string;

  registrosEntrada: number;

  registrosRechazados: number;
}

export function crearSyncRun(
  data: CrearSyncRun
): number {
  const result =
    db.prepare(`
      INSERT INTO sync_runs (
        archivo_processed,
        started_at,
        registros_entrada,
        registros_rechazados,
        estado
      )
      VALUES (
        @archivoProcessed,
        @startedAt,
        @registrosEntrada,
        @registrosRechazados,
        'RUNNING'
      )
    `)
      .run(data);

  return Number(
    result.lastInsertRowid
  );
}

export function completarSyncRun(
  id: number,
  data: {
    finishedAt: string;
    registrosNuevos: number;
    registrosExistentes: number;
  }
): void {
  db.prepare(`
    UPDATE sync_runs
    SET
      finished_at = @finishedAt,
      registros_nuevos = @registrosNuevos,
      registros_existentes = @registrosExistentes,
      estado = 'SUCCESS'
    WHERE id = @id
  `)
    .run({
      id,
      ...data,
    });
}

export function fallarSyncRun(
  id: number,
  data: {
    finishedAt: string;
    errorMessage: string;
  }
): void {
  db.prepare(`
    UPDATE sync_runs
    SET
      finished_at = @finishedAt,
      estado = 'ERROR',
      error_message = @errorMessage
    WHERE id = @id
  `)
    .run({
      id,
      ...data,
    });
}