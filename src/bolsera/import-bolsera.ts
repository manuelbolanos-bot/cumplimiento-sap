import fs from "node:fs";
import path from "node:path";

import XlsxPopulate from "xlsx-populate";

import {
  db,
} from "../database/db.js";

/* =========================================================
   CONFIG
========================================================= */

const SOURCE_NAME =
  "DRIVE_BOLSERA";

const SHEETS = [
  {
    sheetName: "476",
    maquina: "476",
  },
  {
    sheetName: "478",
    maquina: "478",
  },
  {
    sheetName: "SPOUT",
    maquina: "C.SPOUT",
  },
];

const FIRST_DATA_ROW =
  3;

const MAX_DATA_ROW =
  500;

/* =========================================================
   TIPOS
========================================================= */

interface Args {
  archivo: string;
  periodo: string;
}

interface BolseraRow {
  fuente: string;
  periodo: string;

  fecha: string;
  maquina: string;

  plan: number;
  real: number;

  diferencia: number;
  cumplimiento: number | null;

  comentario: string | null;
  responsable: string | null;
  fechaEjecucion: string | null;

  archivoFuente: string;
}

/* =========================================================
   ARGUMENTOS
========================================================= */

function leerArgumentos():
Args {
  let archivo:
    string | null =
    null;

  let periodo:
    string | null =
    null;

  for (
    const arg of
      process.argv.slice(2)
  ) {
    if (
      arg.startsWith(
        "--archivo="
      )
    ) {
      archivo =
        arg.substring(
          "--archivo=".length
        );
    }

    if (
      arg.startsWith(
        "--periodo="
      )
    ) {
      periodo =
        arg.substring(
          "--periodo=".length
        );
    }
  }

  if (
    !archivo
  ) {
    throw new Error(
      'Debes indicar --archivo="ruta/al/archivo.xlsx"'
    );
  }

  if (
    !periodo ||
    !/^\d{4}-\d{2}$/.test(
      periodo
    )
  ) {
    throw new Error(
      "Debes indicar --periodo=AAAA-MM"
    );
  }

  const ruta =
    path.resolve(
      archivo
    );

  if (
    !fs.existsSync(
      ruta
    )
  ) {
    throw new Error(
      `No existe el archivo:\n${ruta}`
    );
  }

  return {
    archivo:
      ruta,
    periodo,
  };
}

/* =========================================================
   UTILIDADES
========================================================= */

function numeroSeguro(
  valor: unknown
): number | null {
  if (
    valor ===
      null ||
    valor ===
      undefined ||
    valor ===
      ""
  ) {
    return null;
  }

  if (
    typeof valor ===
    "number"
  ) {
    return Number.isFinite(
      valor
    )
      ? valor
      : null;
  }

  const texto =
    String(
      valor
    )
      .trim()
      .replace(
        /,/g,
        ""
      );

  if (
    texto ===
      ""
  ) {
    return null;
  }

  const numero =
    Number(
      texto
    );

  return Number.isFinite(
    numero
  )
    ? numero
    : null;
}

function textoSeguro(
  valor: unknown
): string | null {
  if (
    valor ===
      null ||
    valor ===
      undefined
  ) {
    return null;
  }

  const texto =
    String(
      valor
    ).trim();

  return texto ===
    ""
    ? null
    : texto;
}

function pad2(
  value: number
): string {
  return String(
    value
  ).padStart(
    2,
    "0"
  );
}

function fechaIsoLocal(
  fecha: Date
): string {
  return [
    fecha.getFullYear(),
    pad2(
      fecha.getMonth() +
      1
    ),
    pad2(
      fecha.getDate()
    ),
  ].join(
    "-"
  );
}

function fechaDesdeSerialExcel(
  serial: number
): Date {
  /*
   * Excel Windows date system:
   * serial 1 = 1900-01-01
   *
   * El uso de 1899-12-30 contempla
   * el bug histórico del año bisiesto 1900.
   */
  const excelEpoch =
    Date.UTC(
      1899,
      11,
      30
    );

  return new Date(
    excelEpoch +
      Math.round(
        serial *
        86400000
      )
  );
}

function convertirFecha(
  valor: unknown
): string | null {
  if (
    valor ===
      null ||
    valor ===
      undefined ||
    valor ===
      ""
  ) {
    return null;
  }

  if (
    valor instanceof
    Date
  ) {
    if (
      Number.isNaN(
        valor.getTime()
      )
    ) {
      return null;
    }

    return fechaIsoLocal(
      valor
    );
  }

  if (
    typeof valor ===
      "number"
  ) {
    if (
      !Number.isFinite(
        valor
      )
    ) {
      return null;
    }

    const fecha =
      fechaDesdeSerialExcel(
        valor
      );

    return [
      fecha.getUTCFullYear(),
      pad2(
        fecha.getUTCMonth() +
        1
      ),
      pad2(
        fecha.getUTCDate()
      ),
    ].join(
      "-"
    );
  }

  const texto =
    String(
      valor
    ).trim();

  /*
   * YYYY-MM-DD
   */
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      texto
    )
  ) {
    return texto;
  }

  /*
   * DD/MM/YYYY o DD-MM-YYYY
   */
  const match =
    texto.match(
      /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/
    );

  if (
    match
  ) {
    const dia =
      Number(
        match[1]
      );

    const mes =
      Number(
        match[2]
      );

    const anio =
      Number(
        match[3]
      );

    return [
      anio,
      pad2(
        mes
      ),
      pad2(
        dia
      ),
    ].join(
      "-"
    );
  }

  return null;
}

function validarFechaPeriodo(
  fecha: string,
  periodo: string,
  contexto: string
): void {
  if (
    !fecha.startsWith(
      `${periodo}-`
    )
  ) {
    throw new Error(
      [
        "PERIODO INVALIDO EN BOLSERA",
        `Esperado: ${periodo}`,
        `Encontrado: ${fecha}`,
        `Contexto: ${contexto}`,
      ].join(
        "\n"
      )
    );
  }
}

/* =========================================================
   BASE DE DATOS
========================================================= */

function asegurarEsquema():
void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bolsera_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      fuente TEXT NOT NULL,
      periodo TEXT NOT NULL,

      fecha TEXT NOT NULL,
      maquina TEXT NOT NULL,

      plan REAL NOT NULL DEFAULT 0,
      real REAL NOT NULL DEFAULT 0,

      diferencia REAL NOT NULL DEFAULT 0,
      cumplimiento REAL,

      comentario TEXT,
      responsable TEXT,
      fecha_ejecucion TEXT,

      archivo_fuente TEXT NOT NULL,
      importado_en TEXT NOT NULL,

      UNIQUE (
        fuente,
        fecha,
        maquina
      )
    );

    CREATE INDEX IF NOT EXISTS idx_bolsera_daily_periodo
      ON bolsera_daily (
        periodo
      );

    CREATE INDEX IF NOT EXISTS idx_bolsera_daily_fecha
      ON bolsera_daily (
        fecha
      );

    CREATE INDEX IF NOT EXISTS idx_bolsera_daily_maquina
      ON bolsera_daily (
        maquina
      );

    DROP VIEW IF EXISTS v_bolsera_daily;

    CREATE VIEW v_bolsera_daily AS
    SELECT
      fuente,
      periodo,

      fecha,

      CAST(
        substr(
          fecha,
          1,
          4
        ) AS INTEGER
      ) AS anio,

      CAST(
        substr(
          fecha,
          6,
          2
        ) AS INTEGER
      ) AS mes,

      CAST(
        substr(
          fecha,
          9,
          2
        ) AS INTEGER
      ) AS dia,

      maquina,

      'BOLSERA' AS seccion,

      plan,
      real,

      diferencia,
      cumplimiento,

      0.0 AS desperdicio,
      0.0 AS horas,

      comentario,
      responsable,
      fecha_ejecucion,

      archivo_fuente,
      importado_en

    FROM
      bolsera_daily;
  `);
}

/* =========================================================
   EXTRACCIÓN
========================================================= */

async function extraerBolsera(
  archivo: string,
  periodo: string
):
Promise<BolseraRow[]> {
  const workbook =
    await XlsxPopulate
      .fromFileAsync(
        archivo
      );

  const resultado:
    BolseraRow[] = [];

  const nombreArchivo =
    path.basename(
      archivo
    );

  for (
    const config of
      SHEETS
  ) {
    const sheet =
      workbook.sheet(
        config.sheetName
      );

    if (
      !sheet
    ) {
      throw new Error(
        `No existe la hoja "${config.sheetName}" en ${nombreArchivo}.`
      );
    }

    let filasConDatos =
      0;

    for (
      let row =
        FIRST_DATA_ROW;
      row <=
        MAX_DATA_ROW;
      row++
    ) {
      const rawFecha =
        sheet
          .cell(
            `A${row}`
          )
          .value();

      const fecha =
        convertirFecha(
          rawFecha
        );

      /*
       * Si no hay fecha, la fila no es una fila diaria válida.
       */
      if (
        !fecha
      ) {
        continue;
      }

      const planRaw =
        numeroSeguro(
          sheet
            .cell(
              `B${row}`
            )
            .value()
        );

      const realRaw =
        numeroSeguro(
          sheet
            .cell(
              `C${row}`
            )
            .value()
        );

      /*
       * Días sin programación y sin producción:
       * no se importan.
       *
       * Importante:
       * si Plan está vacío pero Real tiene producción,
       * SÍ se conserva la fila.
       */
      if (
        planRaw ===
          null &&
        realRaw ===
          null
      ) {
        continue;
      }

      validarFechaPeriodo(
        fecha,
        periodo,
        `${config.sheetName}!A${row}`
      );

      const plan =
        planRaw ??
        0;

      const real =
        realRaw ??
        0;

      const diferencia =
        real -
        plan;

      const cumplimiento =
        plan >
        0
          ? real /
            plan
          : null;

      const comentario =
        textoSeguro(
          sheet
            .cell(
              `I${row}`
            )
            .value()
        );

      const responsable =
        textoSeguro(
          sheet
            .cell(
              `K${row}`
            )
            .value()
        );

      const fechaEjecucion =
        convertirFecha(
          sheet
            .cell(
              `L${row}`
            )
            .value()
        );

      resultado.push({
        fuente:
          SOURCE_NAME,

        periodo,

        fecha,

        maquina:
          config.maquina,

        plan,
        real,

        diferencia,
        cumplimiento,

        comentario,
        responsable,
        fechaEjecucion,

        archivoFuente:
          nombreArchivo,
      });

      filasConDatos++;
    }

    console.log(
      `✓ ${config.sheetName.padEnd(
        6
      )}: ${filasConDatos} día(s) con datos`
    );
  }

  return resultado;
}

/* =========================================================
   VALIDACIONES
========================================================= */

function validarSinDuplicados(
  rows: BolseraRow[]
): void {
  const vistos =
    new Set<string>();

  for (
    const row of
      rows
  ) {
    const key =
      `${row.fecha}|${row.maquina}`;

    if (
      vistos.has(
        key
      )
    ) {
      throw new Error(
        `Duplicado BOLSERA detectado: ${key}`
      );
    }

    vistos.add(
      key
    );
  }
}

function mostrarResumen(
  rows: BolseraRow[]
): void {
  console.log(
    "\nResumen detectado:"
  );

  for (
    const maquina of [
      "476",
      "478",
      "C.SPOUT",
    ]
  ) {
    const seleccionados =
      rows.filter(
        (
          row
        ) =>
          row.maquina ===
          maquina
      );

    const plan =
      seleccionados.reduce(
        (
          total,
          row
        ) =>
          total +
          row.plan,
        0
      );

    const real =
      seleccionados.reduce(
        (
          total,
          row
        ) =>
          total +
          row.real,
        0
      );

    const cumplimiento =
      plan >
      0
        ? real /
          plan
        : null;

    const cumplimientoTexto =
      cumplimiento ===
      null
        ? "N/A"
        : `${(
            cumplimiento *
            100
          ).toFixed(
            2
          )}%`;

    console.log(
      [
        maquina.padEnd(
          8
        ),

        `Días=${String(
          seleccionados.length
        ).padStart(
          2
        )}`,

        `Plan=${plan.toFixed(
          3
        ).padStart(
          12
        )}`,

        `Real=${real.toFixed(
          3
        ).padStart(
          12
        )}`,

        `Cump=${cumplimientoTexto}`,
      ].join(
        " | "
      )
    );
  }
}

/* =========================================================
   INGESTA TRANSACCIONAL
========================================================= */

function guardarBolsera(
  rows: BolseraRow[],
  periodo: string
): {
  eliminados: number;
  insertados: number;
} {
  const borrar =
    db.prepare(`
      DELETE FROM
        bolsera_daily

      WHERE
        fuente = ?
        AND periodo = ?
    `);

  const insertar =
    db.prepare(`
      INSERT INTO bolsera_daily (
        fuente,
        periodo,

        fecha,
        maquina,

        plan,
        real,

        diferencia,
        cumplimiento,

        comentario,
        responsable,
        fecha_ejecucion,

        archivo_fuente,
        importado_en
      )
      VALUES (
        @fuente,
        @periodo,

        @fecha,
        @maquina,

        @plan,
        @real,

        @diferencia,
        @cumplimiento,

        @comentario,
        @responsable,
        @fechaEjecucion,

        @archivoFuente,
        @importadoEn
      )
    `);

  const ejecutar =
    db.transaction(
      () => {
        const deleteResult =
          borrar.run(
            SOURCE_NAME,
            periodo
          );

        const importadoEn =
          new Date()
            .toISOString();

        let insertados =
          0;

        for (
          const row of
            rows
        ) {
          insertar.run({
            ...row,
            importadoEn,
          });

          insertados++;
        }

        return {
          eliminados:
            deleteResult.changes,

          insertados,
        };
      }
    );

  return ejecutar();
}

/* =========================================================
   VERIFICACIÓN SQLITE
========================================================= */

function verificarSQLite(
  periodo: string
): void {
  const rows =
    db.prepare(`
      SELECT
        maquina,
        COUNT(*) AS dias,
        SUM(plan) AS plan,
        SUM(real) AS real,

        CASE
          WHEN SUM(plan) > 0
            THEN SUM(real) * 1.0 / SUM(plan)
          ELSE NULL
        END AS cumplimiento

      FROM
        bolsera_daily

      WHERE
        fuente = ?
        AND periodo = ?

      GROUP BY
        maquina

      ORDER BY
        maquina
    `)
      .all(
        SOURCE_NAME,
        periodo
      ) as Array<{
        maquina: string;
        dias: number;
        plan: number;
        real: number;
        cumplimiento: number | null;
      }>;

  console.log(
    "\nVerificación SQLite:"
  );

  for (
    const row of
      rows
  ) {
    const cumplimiento =
      row.cumplimiento ===
      null
        ? "N/A"
        : `${(
            row.cumplimiento *
            100
          ).toFixed(
            2
          )}%`;

    console.log(
      [
        row.maquina.padEnd(
          8
        ),

        `Días=${String(
          row.dias
        ).padStart(
          2
        )}`,

        `Plan=${Number(
          row.plan
        ).toFixed(
          3
        ).padStart(
          12
        )}`,

        `Real=${Number(
          row.real
        ).toFixed(
          3
        ).padStart(
          12
        )}`,

        `Cump=${cumplimiento}`,
      ].join(
        " | "
      )
    );
  }
}

/* =========================================================
   MAIN
========================================================= */

async function main():
Promise<void> {
  const {
    archivo,
    periodo,
  } =
    leerArgumentos();

  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "IMPORTADOR BOLSERA - FUENTE MENSUAL"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `Periodo: ${periodo}`
  );

  console.log(
    `Archivo: ${archivo}`
  );

  console.log(
    `Fuente:  ${SOURCE_NAME}`
  );

  asegurarEsquema();

  console.log(
    "\n[1/3] Leyendo hojas 476 / 478 / SPOUT..."
  );

  const rows =
    await extraerBolsera(
      archivo,
      periodo
    );

  if (
    rows.length ===
    0
  ) {
    throw new Error(
      [
        "El archivo no contiene datos de Bolsera para importar.",
        "No se modificó SQLite.",
      ].join(
        "\n"
      )
    );
  }

  console.log(
    "\n[2/3] Validando..."
  );

  validarSinDuplicados(
    rows
  );

  console.log(
    `✓ ${rows.length} registro(s) válido(s).`
  );

  mostrarResumen(
    rows
  );

  console.log(
    "\n[3/3] Guardando en SQLite..."
  );

  const resultado =
    guardarBolsera(
      rows,
      periodo
    );

  console.log(
    `✓ Registros anteriores reemplazados: ${resultado.eliminados}`
  );

  console.log(
    `✓ Registros insertados: ${resultado.insertados}`
  );

  verificarSQLite(
    periodo
  );

  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "IMPORTACIÓN BOLSERA COMPLETADA"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `Fuente:   ${SOURCE_NAME}`
  );

  console.log(
    `Periodo:  ${periodo}`
  );

  console.log(
    `Registros: ${resultado.insertados}`
  );

  console.log(
    "\nSiguiente paso:"
  );

  console.log(
    "Integrar v_bolsera_daily con la vista semántica v_cumplimiento_diario."
  );
}

main().catch(
  (
    error
  ) => {
    console.error(
      "\nERROR IMPORTANDO BOLSERA"
    );

    console.error(
      error
    );

    process.exit(
      1
    );
  }
);
