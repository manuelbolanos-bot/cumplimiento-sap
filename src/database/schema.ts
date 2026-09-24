import { db } from "./db.js";

export function createDatabaseSchema(): void {
  db.exec(`
    /* =====================================================
       EVENTOS SAP
    ===================================================== */

    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,

      orden TEXT NOT NULL,
      operador TEXT,
      turno INTEGER,

      codigo_material TEXT,
      pedido TEXT,
      posicion INTEGER,

      nombre_material TEXT,

      fecha_reporte TEXT NOT NULL,
      fecha_reporte_original TEXT,

      puesto_trabajo TEXT NOT NULL,

      horas REAL NOT NULL DEFAULT 0,

      cantidad_operacion REAL NOT NULL DEFAULT 0,
      unidad_operacion TEXT,

      cantidad_notificada REAL NOT NULL DEFAULT 0,
      unidad_notificada TEXT,

      cantidad_metros REAL NOT NULL DEFAULT 0,
      unidad_metros TEXT,

      desperdicio REAL NOT NULL DEFAULT 0,
      unidad_desperdicio TEXT,

      fuente TEXT NOT NULL,
      sociedad TEXT NOT NULL,

      procesado_en TEXT NOT NULL,

      inserted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_events_fecha_reporte
      ON events(fecha_reporte);

    CREATE INDEX IF NOT EXISTS idx_events_orden
      ON events(orden);

    CREATE INDEX IF NOT EXISTS idx_events_puesto_trabajo
      ON events(puesto_trabajo);

    CREATE INDEX IF NOT EXISTS idx_events_codigo_material
      ON events(codigo_material);


    /* =====================================================
       HISTORIAL DE SINCRONIZACIONES
    ===================================================== */

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      archivo_processed TEXT NOT NULL,

      started_at TEXT NOT NULL,
      finished_at TEXT,

      registros_entrada INTEGER NOT NULL DEFAULT 0,
      registros_nuevos INTEGER NOT NULL DEFAULT 0,
      registros_existentes INTEGER NOT NULL DEFAULT 0,
      registros_rechazados INTEGER NOT NULL DEFAULT 0,

      estado TEXT NOT NULL,

      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at
      ON sync_runs(started_at);


    /* =====================================================
       MAPEO DE PUESTOS SAP → MÁQUINAS DE CUMPLIMIENTO

       Esta tabla NO contiene datos inventados.

       Se irá completando cuando confirmemos qué puesto SAP
       corresponde a cada máquina histórica.
    ===================================================== */

    CREATE TABLE IF NOT EXISTS machine_mapping (
      puesto_sap TEXT PRIMARY KEY,

      maquina TEXT NOT NULL,

      proceso TEXT NOT NULL,

      unidad TEXT,

      campo_plan TEXT NOT NULL,

      campo_real TEXT NOT NULL,

      activo INTEGER NOT NULL DEFAULT 1,

      notas TEXT,

      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CHECK (
        proceso IN (
          'IMPRESION',
          'LAMINACION',
          'GRAFILADORA',
          'BOLSERA'
        )
      ),

      CHECK (
        campo_plan IN (
          'cantidad_operacion',
          'cantidad_notificada',
          'cantidad_metros'
        )
      ),

      CHECK (
        campo_real IN (
          'cantidad_operacion',
          'cantidad_notificada',
          'cantidad_metros'
        )
      )
    );

    CREATE INDEX IF NOT EXISTS idx_machine_mapping_maquina
      ON machine_mapping(maquina);

    CREATE INDEX IF NOT EXISTS idx_machine_mapping_proceso
      ON machine_mapping(proceso);
  `);
}