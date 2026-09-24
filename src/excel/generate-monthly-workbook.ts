import fs from "node:fs";
import path from "node:path";

import XlsxPopulate from "xlsx-populate";
import JSZip from "jszip";

import {
  db,
} from "../database/db.js";

/* =========================================================
   CONFIG
========================================================= */

const TEMPLATE_PATH =
  path.resolve(
    "data/templates/PLANTILLA_MAESTRA_LIMPIA.xlsx"
  );

const OUTPUT_DIR =
  path.resolve(
    "data/excel-generado"
  );

/*
 * Regla histórica del libro:
 *
 *   Pérdida $ = Diferencia × 0.5
 *
 * Se replica exactamente el comportamiento existente,
 * incluyendo el signo de la diferencia.
 *
 * Ejemplo:
 * Diferencia = -100,000
 * Pérdida $   = -50,000
 */
const PERDIDA_FACTOR =
  0.5;

const MONTH_NAMES:
Record<number, string> = {
  1: "enero",
  2: "febrero",
  3: "marzo",
  4: "abril",
  5: "mayo",
  6: "junio",
  7: "julio",
  8: "agosto",
  9: "septiembre",
  10: "octubre",
  11: "noviembre",
  12: "diciembre",
};

const MONTH_NAMES_UPPER:
Record<number, string> = {
  1: "ENERO",
  2: "FEBRERO",
  3: "MARZO",
  4: "ABRIL",
  5: "MAYO",
  6: "JUNIO",
  7: "JULIO",
  8: "AGOSTO",
  9: "SEPTIEMBRE",
  10: "OCTUBRE",
  11: "NOVIEMBRE",
  12: "DICIEMBRE",
};

/* =========================================================
   TIPOS
========================================================= */

interface Args {
  anio: number;
  mes: number;
}

interface DailyRow {
  fecha: string;
  dia: number;

  maquina: string;
  seccion: string;

  plan: number;
  real: number;

  diferencia: number;
  cumplimiento: number;

  desperdicio: number;
  horas: number;
}

interface MachineExcelConfig {
  row: number;
  seccion: string;
}

interface SectionExcelConfig {
  totalRow: number;
  complianceCell: string;
}

interface FourRowConfig {
  planRow: number;
  realRow: number;
  diffRow: number;
  complianceRow: number;

  seccion: string;
}

interface WeekGroup {
  sheetName: string;
  weekNumber: number;

  startDate: Date;
  endDate: Date;

  rows: DailyRow[];
}

interface SectionSummary {
  plan: number;
  real: number;
  diferencia: number;
  cumplimiento: number;
}

interface SummaryMachineConfig {
  row: number;
  seccion: string;
}

interface SummarySectionConfig {
  totalRow: number;
  complianceRow: number;
  label: string;
}

/* =========================================================
   HOJAS DIARIAS
========================================================= */

const MACHINE_ROWS:
Record<string, MachineExcelConfig> = {
  "429": {
    row: 3,
    seccion: "IMPRESION",
  },

  "424": {
    row: 4,
    seccion: "IMPRESION",
  },

  "410": {
    row: 5,
    seccion: "IMPRESION",
  },

  "411": {
    row: 6,
    seccion: "IMPRESION",
  },

  "439": {
    row: 12,
    seccion: "LAMINACION",
  },

  "444": {
    row: 13,
    seccion: "LAMINACION",
  },

  "447": {
    row: 14,
    seccion: "LAMINACION",
  },

  "446": {
    row: 15,
    seccion: "LAMINACION",
  },

  "430": {
    row: 16,
    seccion: "LAMINACION",
  },

  "431": {
    row: 23,
    seccion: "GRAFILADORA",
  },

  "465": {
    row: 24,
    seccion: "GRAFILADORA",
  },

  "476": {
    row: 31,
    seccion: "BOLSERA",
  },

  "478": {
    row: 32,
    seccion: "BOLSERA",
  },

  "C.SPOUT": {
    row: 33,
    seccion: "BOLSERA",
  },
};

const SECTION_ROWS:
Record<string, SectionExcelConfig> = {
  IMPRESION: {
    totalRow: 7,
    complianceCell: "D9",
  },

  LAMINACION: {
    totalRow: 17,
    complianceCell: "D19",
  },

  GRAFILADORA: {
    totalRow: 25,
    complianceCell: "D27",
  },

  BOLSERA: {
    totalRow: 34,
    complianceCell: "D36",
  },
};

/* =========================================================
   SEMANAL
========================================================= */

const WEEKLY_MACHINE_ROWS:
Record<string, FourRowConfig> = {
  "410": {
    planRow: 5,
    realRow: 6,
    diffRow: 7,
    complianceRow: 8,
    seccion: "IMPRESION",
  },

  "411": {
    planRow: 9,
    realRow: 10,
    diffRow: 11,
    complianceRow: 12,
    seccion: "IMPRESION",
  },

  "424": {
    planRow: 13,
    realRow: 14,
    diffRow: 15,
    complianceRow: 16,
    seccion: "IMPRESION",
  },

  "429": {
    planRow: 17,
    realRow: 18,
    diffRow: 19,
    complianceRow: 20,
    seccion: "IMPRESION",
  },

  "439": {
    planRow: 21,
    realRow: 22,
    diffRow: 23,
    complianceRow: 24,
    seccion: "LAMINACION",
  },

  "444": {
    planRow: 25,
    realRow: 26,
    diffRow: 27,
    complianceRow: 28,
    seccion: "LAMINACION",
  },

  "447": {
    planRow: 29,
    realRow: 30,
    diffRow: 31,
    complianceRow: 32,
    seccion: "LAMINACION",
  },

  "446": {
    planRow: 33,
    realRow: 34,
    diffRow: 35,
    complianceRow: 36,
    seccion: "LAMINACION",
  },

  "430": {
    planRow: 37,
    realRow: 38,
    diffRow: 39,
    complianceRow: 40,
    seccion: "LAMINACION",
  },

  "431": {
    planRow: 41,
    realRow: 42,
    diffRow: 43,
    complianceRow: 44,
    seccion: "GRAFILADORA",
  },

  "465": {
    planRow: 45,
    realRow: 46,
    diffRow: 47,
    complianceRow: 48,
    seccion: "GRAFILADORA",
  },

  "476": {
    planRow: 49,
    realRow: 50,
    diffRow: 51,
    complianceRow: 52,
    seccion: "BOLSERA",
  },

  "478": {
    planRow: 53,
    realRow: 54,
    diffRow: 55,
    complianceRow: 56,
    seccion: "BOLSERA",
  },

  "C.SPOUT": {
    planRow: 57,
    realRow: 58,
    diffRow: 59,
    complianceRow: 60,
    seccion: "BOLSERA",
  },
};

const WEEK_COLUMNS = [
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
];

const WEEK_TOTAL_COLUMN =
  "AJ";

/* =========================================================
   HOJA MES
========================================================= */

const MONTHLY_MACHINE_ROWS:
Record<string, FourRowConfig> = {
  "410": {
    planRow: 5,
    realRow: 6,
    diffRow: 7,
    complianceRow: 8,
    seccion: "IMPRESION",
  },

  "411": {
    planRow: 9,
    realRow: 10,
    diffRow: 11,
    complianceRow: 12,
    seccion: "IMPRESION",
  },

  "424": {
    planRow: 13,
    realRow: 14,
    diffRow: 15,
    complianceRow: 16,
    seccion: "IMPRESION",
  },

  "429": {
    planRow: 17,
    realRow: 18,
    diffRow: 19,
    complianceRow: 20,
    seccion: "IMPRESION",
  },

  "439": {
    planRow: 21,
    realRow: 22,
    diffRow: 23,
    complianceRow: 24,
    seccion: "LAMINACION",
  },

  "444": {
    planRow: 25,
    realRow: 26,
    diffRow: 27,
    complianceRow: 28,
    seccion: "LAMINACION",
  },

  "446": {
    planRow: 29,
    realRow: 30,
    diffRow: 31,
    complianceRow: 32,
    seccion: "LAMINACION",
  },

  "447": {
    planRow: 33,
    realRow: 34,
    diffRow: 35,
    complianceRow: 36,
    seccion: "LAMINACION",
  },

  "430": {
    planRow: 37,
    realRow: 38,
    diffRow: 39,
    complianceRow: 40,
    seccion: "LAMINACION",
  },

  "431": {
    planRow: 41,
    realRow: 42,
    diffRow: 43,
    complianceRow: 44,
    seccion: "GRAFILADORA",
  },

  "476": {
    planRow: 45,
    realRow: 46,
    diffRow: 47,
    complianceRow: 48,
    seccion: "BOLSERA",
  },

  "478": {
    planRow: 49,
    realRow: 50,
    diffRow: 51,
    complianceRow: 52,
    seccion: "BOLSERA",
  },

  "C.SPOUT": {
    planRow: 53,
    realRow: 54,
    diffRow: 55,
    complianceRow: 56,
    seccion: "BOLSERA",
  },
};

/* =========================================================
   HOJA %
========================================================= */

const PERCENT_MACHINE_ROWS:
Record<string, number> = {
  "410": 5,
  "411": 6,
  "424": 7,
  "429": 8,

  "439": 9,
  "444": 10,
  "446": 11,
  "447": 12,
  "430": 13,

  "431": 14,

  "476": 15,
  "478": 16,
  "C.SPOUT": 17,
};

/* =========================================================
   HOJA RESUMEN
========================================================= */

const SUMMARY_MACHINE_ROWS:
Record<string, SummaryMachineConfig> = {
  "429": {
    row: 3,
    seccion: "IMPRESION",
  },

  "424": {
    row: 4,
    seccion: "IMPRESION",
  },

  "410": {
    row: 5,
    seccion: "IMPRESION",
  },

  "411": {
    row: 6,
    seccion: "IMPRESION",
  },

  "439": {
    row: 12,
    seccion: "LAMINACION",
  },

  "444": {
    row: 13,
    seccion: "LAMINACION",
  },

  "447": {
    row: 14,
    seccion: "LAMINACION",
  },

  "446": {
    row: 15,
    seccion: "LAMINACION",
  },

  "430": {
    row: 16,
    seccion: "LAMINACION",
  },

  "431": {
    row: 24,
    seccion: "GRAFILADORA",
  },

  "465": {
    row: 25,
    seccion: "GRAFILADORA",
  },

  "476": {
    row: 34,
    seccion: "BOLSERA",
  },

  "478": {
    row: 35,
    seccion: "BOLSERA",
  },

  "C.SPOUT": {
    row: 36,
    seccion: "BOLSERA",
  },
};

const SUMMARY_SECTION_ROWS:
Record<string, SummarySectionConfig> = {
  IMPRESION: {
    totalRow: 7,
    complianceRow: 9,
    label: "Cumplimiento Impresión",
  },

  LAMINACION: {
    totalRow: 17,
    complianceRow: 20,
    label: "Cumplimiento Laminación",
  },

  GRAFILADORA: {
    totalRow: 29,
    complianceRow: 31,
    label: "Cumplimiento Grafiladora",
  },

  BOLSERA: {
    totalRow: 37,
    complianceRow: 40,
    label: "Cumplimiento Bolsera",
  },
};

/* =========================================================
   ARGUMENTOS
========================================================= */

function leerArgumentos():
Args {
  let anio:
    number | null =
    null;

  let mes:
    number | null =
    null;

  for (
    const arg of
      process.argv.slice(2)
  ) {
    if (
      arg.startsWith(
        "--anio="
      )
    ) {
      anio =
        Number(
          arg.substring(
            "--anio=".length
          )
        );
    }

    if (
      arg.startsWith(
        "--mes="
      )
    ) {
      mes =
        Number(
          arg.substring(
            "--mes=".length
          )
        );
    }
  }

  if (
    !anio ||
    anio < 2000 ||
    anio > 2100
  ) {
    throw new Error(
      "Debes indicar --anio=AAAA"
    );
  }

  if (
    !mes ||
    mes < 1 ||
    mes > 12
  ) {
    throw new Error(
      "Debes indicar --mes=1..12"
    );
  }

  return {
    anio,
    mes,
  };
}

/* =========================================================
   SQLITE
========================================================= */

function obtenerDatos(
  anio: number,
  mes: number
): DailyRow[] {
  return db.prepare(`
    SELECT
      fecha,
      dia,

      maquina,
      seccion,

      plan,
      real,

      diferencia,
      cumplimiento,

      desperdicio,
      horas

    FROM
      v_cumplimiento_diario

    WHERE
      anio = ?
      AND mes = ?

    ORDER BY
      fecha,
      seccion,
      maquina
  `)
    .all(
      anio,
      mes
    ) as DailyRow[];
}

/* =========================================================
   UTILIDADES
========================================================= */

function normalizarMaquina(
  maquina: unknown
): string {
  return String(
    maquina ?? ""
  )
    .trim()
    .toUpperCase()
    .replace(
      /\s+/g,
      ""
    )
    .replace(
      /^C\.?SPOUT$/,
      "C.SPOUT"
    );
}

function diasDelMes(
  anio: number,
  mes: number
): number {
  return new Date(
    anio,
    mes,
    0
  ).getDate();
}

function numeroAColumnaExcel(
  numero: number
): string {
  let resultado =
    "";

  let actual =
    numero;

  while (
    actual > 0
  ) {
    const resto =
      (
        actual - 1
      ) % 26;

    resultado =
      String.fromCharCode(
        65 + resto
      ) +
      resultado;

    actual =
      Math.floor(
        (
          actual - 1
        ) / 26
      );
  }

  return resultado;
}

function aplicarFormatoNumero(
  cell: any
): void {
  cell.style(
    "numberFormat",
    "#,##0.000"
  );
}

function aplicarFormatoPorcentaje(
  cell: any
): void {
  cell.style(
    "numberFormat",
    "0.00%"
  );
}

function aplicarFormatoMoneda(
  cell: any
): void {
  cell.style(
    "numberFormat",
    '$#,##0.00;-$#,##0.00'
  );
}

function agruparPorDia(
  rows: DailyRow[]
):
Map<number, DailyRow[]> {
  const mapa =
    new Map<
      number,
      DailyRow[]
    >();

  for (
    const row of rows
  ) {
    const actual =
      mapa.get(
        row.dia
      ) ?? [];

    actual.push(
      row
    );

    mapa.set(
      row.dia,
      actual
    );
  }

  return mapa;
}

/* =========================================================
   RESUMEN POR SECCIÓN
========================================================= */

function calcularResumenSeccion(
  rows: DailyRow[],
  seccion: string
):
SectionSummary | null {
  const seleccionados =
    rows.filter(
      (
        row
      ) =>
        row.seccion ===
        seccion
    );

  if (
    seleccionados.length ===
    0
  ) {
    return null;
  }

  const plan =
    seleccionados.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.plan
        ),
      0
    );

  const real =
    seleccionados.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.real
        ),
      0
    );

  const diferencia =
    real -
    plan;

  const cumplimiento =
    plan !==
    0
      ? real /
        plan
      : 0;

  return {
    plan,
    real,
    diferencia,
    cumplimiento,
  };
}

/* =========================================================
   ================= DIARIO ================================
========================================================= */

function limpiarDatosDia(
  sheet: any
): void {
  for (
    const config of
      Object.values(
        MACHINE_ROWS
      )
  ) {
    sheet
      .range(
        `C${config.row}:F${config.row}`
      )
      .clear({
        contentsOnly:
          true,
      });

    sheet
      .range(
        `G${config.row}:I${config.row}`
      )
      .clear({
        contentsOnly:
          true,
      });
  }

  for (
    const config of
      Object.values(
        SECTION_ROWS
      )
  ) {
    sheet
      .range(
        `C${config.totalRow}:F${config.totalRow}`
      )
      .clear({
        contentsOnly:
          true,
      });

    sheet
      .cell(
        config.complianceCell
      )
      .value(
        undefined
      );
  }
}

function escribirRegistroDiario(
  sheet: any,
  registro: DailyRow
): boolean {
  const maquina =
    normalizarMaquina(
      registro.maquina
    );

  const config =
    MACHINE_ROWS[
      maquina
    ];

  if (
    !config
  ) {
    console.warn(
      `⚠ Máquina ${maquina} no existe en formato diario.`
    );

    return false;
  }

  const row =
    config.row;

  const plan =
    sheet.cell(
      `C${row}`
    );

  const real =
    sheet.cell(
      `D${row}`
    );

  const diferencia =
    sheet.cell(
      `E${row}`
    );

  const cumplimiento =
    sheet.cell(
      `F${row}`
    );

  plan.value(
    registro.plan
  );

  real.value(
    registro.real
  );

  diferencia.value(
    registro.diferencia
  );

  cumplimiento.value(
    registro.cumplimiento
  );

  aplicarFormatoNumero(
    plan
  );

  aplicarFormatoNumero(
    real
  );

  aplicarFormatoNumero(
    diferencia
  );

  aplicarFormatoPorcentaje(
    cumplimiento
  );

  return true;
}

function escribirTotalesSeccionDia(
  sheet: any,
  registros: DailyRow[]
): void {
  for (
    const [
      seccion,
      config,
    ] of Object.entries(
      SECTION_ROWS
    )
  ) {
    const resumen =
      calcularResumenSeccion(
        registros,
        seccion
      );

    if (
      !resumen
    ) {
      continue;
    }

    const plan =
      sheet.cell(
        `C${config.totalRow}`
      );

    const real =
      sheet.cell(
        `D${config.totalRow}`
      );

    const diferencia =
      sheet.cell(
        `E${config.totalRow}`
      );

    const cumplimiento =
      sheet.cell(
        `F${config.totalRow}`
      );

    plan.value(
      resumen.plan
    );

    real.value(
      resumen.real
    );

    diferencia.value(
      resumen.diferencia
    );

    cumplimiento.value(
      resumen.cumplimiento
    );

    aplicarFormatoNumero(
      plan
    );

    aplicarFormatoNumero(
      real
    );

    aplicarFormatoNumero(
      diferencia
    );

    aplicarFormatoPorcentaje(
      cumplimiento
    );

    const visual =
      sheet.cell(
        config.complianceCell
      );

    visual.value(
      resumen.cumplimiento
    );

    aplicarFormatoPorcentaje(
      visual
    );
  }
}

function llenarDia(
  workbook: any,
  dia: number,
  registros: DailyRow[]
): number {
  const nombre =
    String(
      dia
    ).padStart(
      2,
      "0"
    );

  const sheet =
    workbook.sheet(
      nombre
    );

  if (
    !sheet
  ) {
    throw new Error(
      `No existe hoja ${nombre}.`
    );
  }

  limpiarDatosDia(
    sheet
  );

  let escritos =
    0;

  for (
    const registro of
      registros
  ) {
    if (
      escribirRegistroDiario(
        sheet,
        registro
      )
    ) {
      escritos++;
    }
  }

  escribirTotalesSeccionDia(
    sheet,
    registros
  );

  return escritos;
}

/* =========================================================
   ================= SEMANAL ===============================
========================================================= */

function parseDate(
  value: string
): Date {
  const [
    year,
    month,
    day,
  ] =
    value
      .split("-")
      .map(
        Number
      );

  return new Date(
    year,
    month - 1,
    day
  );
}

function formatIsoDate(
  date: Date
): string {
  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    ),
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    ),
  ].join(
    "-"
  );
}

function addDays(
  date: Date,
  amount: number
): Date {
  const result =
    new Date(
      date
    );

  result.setDate(
    result.getDate() +
    amount
  );

  return result;
}

function getMonday(
  date: Date
): Date {
  const result =
    new Date(
      date
    );

  const diff =
    (
      result.getDay() +
      6
    ) % 7;

  result.setDate(
    result.getDate() -
    diff
  );

  result.setHours(
    0,
    0,
    0,
    0
  );

  return result;
}

function isoWeekNumber(
  date: Date
): number {
  const target =
    new Date(
      Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      )
    );

  const dayNumber =
    (
      target.getUTCDay() +
      6
    ) % 7;

  target.setUTCDate(
    target.getUTCDate() -
    dayNumber +
    3
  );

  const firstThursday =
    new Date(
      Date.UTC(
        target.getUTCFullYear(),
        0,
        4
      )
    );

  const firstDayNumber =
    (
      firstThursday.getUTCDay() +
      6
    ) % 7;

  firstThursday.setUTCDate(
    firstThursday.getUTCDate() -
    firstDayNumber +
    3
  );

  return (
    1 +
    Math.round(
      (
        target.getTime() -
        firstThursday.getTime()
      ) /
      604800000
    )
  );
}

function agruparPorSemana(
  rows: DailyRow[]
): WeekGroup[] {
  const mapa =
    new Map<
      string,
      WeekGroup
    >();

  for (
    const row of rows
  ) {
    const fecha =
      parseDate(
        row.fecha
      );

    const inicio =
      getMonday(
        fecha
      );

    const fin =
      addDays(
        inicio,
        6
      );

    const semana =
      isoWeekNumber(
        inicio
      );

    const nombre =
      `S${String(
        semana
      ).padStart(
        2,
        "0"
      )}`;

    if (
      !mapa.has(
        nombre
      )
    ) {
      mapa.set(
        nombre,
        {
          sheetName:
            nombre,

          weekNumber:
            semana,

          startDate:
            inicio,

          endDate:
            fin,

          rows:
            [],
        }
      );
    }

    mapa
      .get(
        nombre
      )!
      .rows
      .push(
        row
      );
  }

  return [
    ...mapa.values(),
  ].sort(
    (
      a,
      b
    ) =>
      a.startDate.getTime() -
      b.startDate.getTime()
  );
}

function obtenerHojasSemanales(
  workbook: any
): any[] {
  return workbook
    .sheets()
    .filter(
      (
        sheet: any
      ) =>
        /^S\d{2}$/i.test(
          sheet.name()
        )
    );
}

function limpiarHojaSemanal(
  sheet: any
): void {
  sheet
    .range(
      "C4:AJ60"
    )
    .clear({
      contentsOnly:
        true,
    });

  sheet
    .range(
      "AK6:AP30"
    )
    .clear({
      contentsOnly:
        true,
    });

  sheet
    .cell(
      "A1"
    )
    .value(
      undefined
    );
}

function escribirEncabezadoSemana(
  sheet: any,
  semana: WeekGroup,
  anio: number,
  mes: number
): void {
  sheet
    .cell(
      "A1"
    )
    .value(
      `${MONTH_NAMES_UPPER[mes]} ${anio}`
    );

  WEEK_COLUMNS.forEach(
    (
      column,
      index
    ) => {
      const fecha =
        addDays(
          semana.startDate,
          index
        );

      const cell =
        sheet.cell(
          `${column}4`
        );

      cell.value(
        fecha
      );

      cell.style(
        "numberFormat",
        "dd/mm"
      );
    }
  );

  sheet
    .cell(
      `${WEEK_TOTAL_COLUMN}4`
    )
    .value(
      "Total"
    );
}

function buscarRegistro(
  rows: DailyRow[],
  date: Date,
  maquina: string
):
DailyRow | undefined {
  const iso =
    formatIsoDate(
      date
    );

  return rows.find(
    (
      row
    ) =>
      row.fecha ===
        iso &&
      normalizarMaquina(
        row.maquina
      ) ===
        maquina
  );
}

function escribirMatrizSemanal(
  sheet: any,
  semana: WeekGroup
): void {
  for (
    const [
      maquina,
      config,
    ] of Object.entries(
      WEEKLY_MACHINE_ROWS
    )
  ) {
    sheet
      .cell(
        `A${config.planRow}`
      )
      .value(
        maquina ===
          "C.SPOUT"
          ? "C.Spout"
          : Number(
              maquina
            )
      );

    sheet
      .cell(
        `B${config.planRow}`
      )
      .value(
        "Plan"
      );

    sheet
      .cell(
        `B${config.realRow}`
      )
      .value(
        "Real"
      );

    sheet
      .cell(
        `B${config.diffRow}`
      )
      .value(
        "Metros"
      );

    sheet
      .cell(
        `B${config.complianceRow}`
      )
      .value(
        "Cump"
      );

    let totalPlan =
      0;

    let totalReal =
      0;

    let tieneDatos =
      false;

    WEEK_COLUMNS.forEach(
      (
        column,
        index
      ) => {
        const fecha =
          addDays(
            semana.startDate,
            index
          );

        const registro =
          buscarRegistro(
            semana.rows,
            fecha,
            maquina
          );

        if (
          !registro
        ) {
          return;
        }

        tieneDatos =
          true;

        totalPlan +=
          Number(
            registro.plan
          );

        totalReal +=
          Number(
            registro.real
          );

        const plan =
          sheet.cell(
            `${column}${config.planRow}`
          );

        const real =
          sheet.cell(
            `${column}${config.realRow}`
          );

        const diff =
          sheet.cell(
            `${column}${config.diffRow}`
          );

        const cump =
          sheet.cell(
            `${column}${config.complianceRow}`
          );

        plan.value(
          registro.plan
        );

        real.value(
          registro.real
        );

        diff.value(
          registro.diferencia
        );

        cump.value(
          registro.cumplimiento
        );

        aplicarFormatoNumero(
          plan
        );

        aplicarFormatoNumero(
          real
        );

        aplicarFormatoNumero(
          diff
        );

        aplicarFormatoPorcentaje(
          cump
        );
      }
    );

    if (
      !tieneDatos
    ) {
      continue;
    }

    const diferencia =
      totalReal -
      totalPlan;

    const cumplimiento =
      totalPlan !==
      0
        ? totalReal /
          totalPlan
        : 0;

    const plan =
      sheet.cell(
        `${WEEK_TOTAL_COLUMN}${config.planRow}`
      );

    const real =
      sheet.cell(
        `${WEEK_TOTAL_COLUMN}${config.realRow}`
      );

    const diff =
      sheet.cell(
        `${WEEK_TOTAL_COLUMN}${config.diffRow}`
      );

    const cump =
      sheet.cell(
        `${WEEK_TOTAL_COLUMN}${config.complianceRow}`
      );

    plan.value(
      totalPlan
    );

    real.value(
      totalReal
    );

    diff.value(
      diferencia
    );

    cump.value(
      cumplimiento
    );

    aplicarFormatoNumero(
      plan
    );

    aplicarFormatoNumero(
      real
    );

    aplicarFormatoNumero(
      diff
    );

    aplicarFormatoPorcentaje(
      cump
    );
  }
}

function escribirResumenSemanal(
  sheet: any,
  semana: WeekGroup
): void {
  sheet
    .cell(
      "AL6"
    )
    .value(
      "Plan"
    );

  sheet
    .cell(
      "AM6"
    )
    .value(
      "Real"
    );

  sheet
    .cell(
      "AN6"
    )
    .value(
      "Dif"
    );

  const configuraciones = [
    {
      seccion:
        "IMPRESION",

      nombre:
        "Impresión",

      fila:
        7,

      filaCumplimiento:
        11,
    },

    {
      seccion:
        "LAMINACION",

      nombre:
        "Laminación",

      fila:
        8,

      filaCumplimiento:
        12,
    },

    {
      seccion:
        "GRAFILADORA",

      nombre:
        "Grafiladora",

      fila:
        9,

      filaCumplimiento:
        13,
    },
  ];

  for (
    const item of
      configuraciones
  ) {
    const resumen =
      calcularResumenSeccion(
        semana.rows,
        item.seccion
      );

    if (
      !resumen
    ) {
      continue;
    }

    sheet
      .cell(
        `AK${item.fila}`
      )
      .value(
        item.nombre
      );

    const plan =
      sheet.cell(
        `AL${item.fila}`
      );

    const real =
      sheet.cell(
        `AM${item.fila}`
      );

    const diferencia =
      sheet.cell(
        `AN${item.fila}`
      );

    plan.value(
      resumen.plan
    );

    real.value(
      resumen.real
    );

    diferencia.value(
      resumen.diferencia
    );

    aplicarFormatoNumero(
      plan
    );

    aplicarFormatoNumero(
      real
    );

    aplicarFormatoNumero(
      diferencia
    );

    sheet
      .cell(
        `AK${item.filaCumplimiento}`
      )
      .value(
        `CUMPLIMIENTO ${item.nombre.toUpperCase()}`
      );

    const cump =
      sheet.cell(
        `AL${item.filaCumplimiento}`
      );

    cump.value(
      resumen.cumplimiento
    );

    aplicarFormatoPorcentaje(
      cump
    );
  }
}

function generarHojasSemanales(
  workbook: any,
  registros: DailyRow[],
  anio: number,
  mes: number
): {
  semanas: number;
  nombres: string[];
} {
  const semanas =
    agruparPorSemana(
      registros
    );

  const hojas =
    obtenerHojasSemanales(
      workbook
    );

  /*
   * Algunos meses ocupan 5 o 6 semanas ISO.
   * La plantilla histórica puede traer menos hojas Sxx.
   *
   * En lugar de abortar, clonamos una hoja semanal existente
   * para completar únicamente las hojas necesarias.
   */
  if (
    hojas.length ===
    0
  ) {
    throw new Error(
      "La plantilla no contiene ninguna hoja semanal Sxx que pueda usarse como base."
    );
  }

  if (
    hojas.length <
    semanas.length
  ) {
    const faltantes =
      semanas.length -
      hojas.length;

    const hojaBase =
      hojas[
        hojas.length -
        1
      ];

    console.log(
      `⚠ La plantilla tiene ${hojas.length} hoja(s) semanal(es), pero el período necesita ${semanas.length}.`
    );

    console.log(
      `✓ Se crearán automáticamente ${faltantes} hoja(s) semanal(es) adicional(es).`
    );

    for (
      let i =
        0;
      i <
        faltantes;
      i++
    ) {
      const nombreTemporal =
        `TMP_WEEK_EXTRA_${i + 1}`;

      const clon =
        workbook.cloneSheet(
          hojaBase,
          nombreTemporal
        );

      /*
       * Dejamos el clon visible y lo limpiamos antes
       * de asignarle su semana definitiva.
       */
      try {
        clon.hidden(
          false
        );
      } catch {
        // La hoja ya es visible o la versión de la librería
        // no expone hidden() como setter en este contexto.
      }

      limpiarHojaSemanal(
        clon
      );

      hojas.push(
        clon
      );
    }
  }

  hojas.forEach(
    (
      sheet: any,
      index: number
    ) => {
      sheet.name(
        `TMP_WEEK_${index + 1}`
      );
    }
  );

  const nombres:
    string[] = [];

  semanas.forEach(
    (
      semana,
      index
    ) => {
      const sheet =
        hojas[
          index
        ];

      sheet.name(
        semana.sheetName
      );

      limpiarHojaSemanal(
        sheet
      );

      escribirEncabezadoSemana(
        sheet,
        semana,
        anio,
        mes
      );

      escribirMatrizSemanal(
        sheet,
        semana
      );

      escribirResumenSemanal(
        sheet,
        semana
      );

      nombres.push(
        semana.sheetName
      );
    }
  );

  for (
    let i =
      semanas.length;
    i <
      hojas.length;
    i++
  ) {
    limpiarHojaSemanal(
      hojas[
        i
      ]
    );

    hojas[
      i
    ].name(
      `SEMANA_NO_USADA_${i + 1}`
    );
  }

  return {
    semanas:
      semanas.length,

    nombres,
  };
}

/* =========================================================
   ================= MES ===================================
========================================================= */

function limpiarHojaMes(
  sheet: any
): void {
  sheet
    .range(
      "C4:AG4"
    )
    .clear({
      contentsOnly:
        true,
    });

  for (
    const config of
      Object.values(
        MONTHLY_MACHINE_ROWS
      )
  ) {
    for (
      const row of [
        config.planRow,
        config.realRow,
        config.diffRow,
        config.complianceRow,
      ]
    ) {
      sheet
        .range(
          `C${row}:AH${row}`
        )
        .clear({
          contentsOnly:
            true,
        });
    }
  }

  sheet
    .range(
      "AK6:AN10"
    )
    .clear({
      contentsOnly:
        true,
    });
}

function escribirEncabezadoMes(
  sheet: any,
  anio: number,
  mes: number
): void {
  sheet
    .cell(
      "A1"
    )
    .value(
      `${MONTH_NAMES_UPPER[mes]} ${anio}`
    );

  const totalDias =
    diasDelMes(
      anio,
      mes
    );

  for (
    let dia = 1;
    dia <= 31;
    dia++
  ) {
    const columna =
      numeroAColumnaExcel(
        dia + 2
      );

    const cell =
      sheet.cell(
        `${columna}4`
      );

    if (
      dia <=
      totalDias
    ) {
      cell.value(
        new Date(
          anio,
          mes - 1,
          dia
        )
      );

      cell.style(
        "numberFormat",
        "dd"
      );
    } else {
      cell.value(
        undefined
      );
    }
  }

  sheet
    .cell(
      "AH4"
    )
    .value(
      "Total"
    );
}

function buscarRegistroMes(
  registros: DailyRow[],
  dia: number,
  maquina: string
):
DailyRow | undefined {
  return registros.find(
    (
      row
    ) =>
      row.dia ===
        dia &&
      normalizarMaquina(
        row.maquina
      ) ===
        maquina
  );
}

function escribirMatrizMes(
  sheet: any,
  registros: DailyRow[],
  anio: number,
  mes: number
): void {
  const totalDias =
    diasDelMes(
      anio,
      mes
    );

  for (
    const [
      maquina,
      config,
    ] of Object.entries(
      MONTHLY_MACHINE_ROWS
    )
  ) {
    sheet
      .cell(
        `A${config.planRow}`
      )
      .value(
        maquina ===
          "C.SPOUT"
          ? "C.Spout"
          : Number(
              maquina
            )
      );

    sheet
      .cell(
        `B${config.planRow}`
      )
      .value(
        "Plan"
      );

    sheet
      .cell(
        `B${config.realRow}`
      )
      .value(
        "Real"
      );

    sheet
      .cell(
        `B${config.diffRow}`
      )
      .value(
        "Metros"
      );

    sheet
      .cell(
        `B${config.complianceRow}`
      )
      .value(
        "Cump"
      );

    let totalPlan =
      0;

    let totalReal =
      0;

    let tieneDatos =
      false;

    for (
      let dia = 1;
      dia <= totalDias;
      dia++
    ) {
      const registro =
        buscarRegistroMes(
          registros,
          dia,
          maquina
        );

      if (
        !registro
      ) {
        continue;
      }

      tieneDatos =
        true;

      totalPlan +=
        Number(
          registro.plan
        );

      totalReal +=
        Number(
          registro.real
        );

      const columna =
        numeroAColumnaExcel(
          dia + 2
        );

      const plan =
        sheet.cell(
          `${columna}${config.planRow}`
        );

      const real =
        sheet.cell(
          `${columna}${config.realRow}`
        );

      const diff =
        sheet.cell(
          `${columna}${config.diffRow}`
        );

      const cump =
        sheet.cell(
          `${columna}${config.complianceRow}`
        );

      plan.value(
        registro.plan
      );

      real.value(
        registro.real
      );

      diff.value(
        registro.diferencia
      );

      cump.value(
        registro.cumplimiento
      );

      aplicarFormatoNumero(
        plan
      );

      aplicarFormatoNumero(
        real
      );

      aplicarFormatoNumero(
        diff
      );

      aplicarFormatoPorcentaje(
        cump
      );
    }

    if (
      !tieneDatos
    ) {
      continue;
    }

    const diferencia =
      totalReal -
      totalPlan;

    const cumplimiento =
      totalPlan !==
      0
        ? totalReal /
          totalPlan
        : 0;

    const plan =
      sheet.cell(
        `AH${config.planRow}`
      );

    const real =
      sheet.cell(
        `AH${config.realRow}`
      );

    const diff =
      sheet.cell(
        `AH${config.diffRow}`
      );

    const cump =
      sheet.cell(
        `AH${config.complianceRow}`
      );

    plan.value(
      totalPlan
    );

    real.value(
      totalReal
    );

    diff.value(
      diferencia
    );

    cump.value(
      cumplimiento
    );

    aplicarFormatoNumero(
      plan
    );

    aplicarFormatoNumero(
      real
    );

    aplicarFormatoNumero(
      diff
    );

    aplicarFormatoPorcentaje(
      cump
    );
  }
}

function escribirResumenMes(
  sheet: any,
  registros: DailyRow[]
): void {
  sheet
    .cell(
      "AL6"
    )
    .value(
      "Plan"
    );

  sheet
    .cell(
      "AM6"
    )
    .value(
      "Real"
    );

  sheet
    .cell(
      "AN6"
    )
    .value(
      "Dif"
    );

  const configuraciones = [
    {
      seccion:
        "IMPRESION",

      nombre:
        "Impresión",

      row:
        7,

      cumplimientoRow:
        9,
    },

    {
      seccion:
        "LAMINACION",

      nombre:
        "Laminación",

      row:
        8,

      cumplimientoRow:
        10,
    },
  ];

  for (
    const item of
      configuraciones
  ) {
    const resumen =
      calcularResumenSeccion(
        registros,
        item.seccion
      );

    if (
      !resumen
    ) {
      continue;
    }

    sheet
      .cell(
        `AK${item.row}`
      )
      .value(
        item.nombre
      );

    const plan =
      sheet.cell(
        `AL${item.row}`
      );

    const real =
      sheet.cell(
        `AM${item.row}`
      );

    const diff =
      sheet.cell(
        `AN${item.row}`
      );

    plan.value(
      resumen.plan
    );

    real.value(
      resumen.real
    );

    diff.value(
      resumen.diferencia
    );

    aplicarFormatoNumero(
      plan
    );

    aplicarFormatoNumero(
      real
    );

    aplicarFormatoNumero(
      diff
    );

    sheet
      .cell(
        `AK${item.cumplimientoRow}`
      )
      .value(
        `CUMPLIMIENTO ${item.nombre.toUpperCase()}`
      );

    const cump =
      sheet.cell(
        `AL${item.cumplimientoRow}`
      );

    cump.value(
      resumen.cumplimiento
    );

    aplicarFormatoPorcentaje(
      cump
    );
  }
}

function generarHojaMes(
  workbook: any,
  registros: DailyRow[],
  anio: number,
  mes: number
): void {
  const sheet =
    workbook.sheet(
      "MES"
    );

  if (
    !sheet
  ) {
    throw new Error(
      'No existe hoja "MES".'
    );
  }

  limpiarHojaMes(
    sheet
  );

  escribirEncabezadoMes(
    sheet,
    anio,
    mes
  );

  escribirMatrizMes(
    sheet,
    registros,
    anio,
    mes
  );

  escribirResumenMes(
    sheet,
    registros
  );
}

/* =========================================================
   ================= HOJA % ================================
========================================================= */

function limpiarHojaPorcentaje(
  sheet: any
): void {
  sheet
    .range(
      "B5:AF17"
    )
    .clear({
      contentsOnly:
        true,
    });

  sheet
    .range(
      "B4:AF4"
    )
    .clear({
      contentsOnly:
        true,
    });
}

function escribirEncabezadoPorcentaje(
  sheet: any,
  anio: number,
  mes: number
): void {
  sheet
    .cell(
      "A1"
    )
    .value(
      `${MONTH_NAMES_UPPER[mes]} ${anio}`
    );

  const totalDias =
    diasDelMes(
      anio,
      mes
    );

  for (
    let dia = 1;
    dia <= 31;
    dia++
  ) {
    const columna =
      numeroAColumnaExcel(
        dia + 1
      );

    const cell =
      sheet.cell(
        `${columna}4`
      );

    if (
      dia <=
      totalDias
    ) {
      cell.value(
        new Date(
          anio,
          mes - 1,
          dia
        )
      );

      cell.style(
        "numberFormat",
        "dd"
      );
    } else {
      cell.value(
        undefined
      );
    }
  }

  sheet
    .cell(
      "AL4"
    )
    .value(
      "Verde"
    );

  sheet
    .cell(
      "AM4"
    )
    .value(
      1
    );

  aplicarFormatoPorcentaje(
    sheet.cell(
      "AM4"
    )
  );

  sheet
    .cell(
      "AL5"
    )
    .value(
      "Amarillo"
    );

  sheet
    .cell(
      "AM5"
    )
    .value(
      0.8
    );

  aplicarFormatoPorcentaje(
    sheet.cell(
      "AM5"
    )
  );

  sheet
    .cell(
      "AL6"
    )
    .value(
      "Rojo"
    );

  sheet
    .cell(
      "AM6"
    )
    .value(
      "<80%"
    );
}

function escribirMatrizPorcentaje(
  sheet: any,
  registros: DailyRow[]
): number {
  let escritos =
    0;

  for (
    const [
      maquina,
      row,
    ] of Object.entries(
      PERCENT_MACHINE_ROWS
    )
  ) {
    sheet
      .cell(
        `A${row}`
      )
      .value(
        maquina ===
          "C.SPOUT"
          ? "C. Spout"
          : Number(
              maquina
            )
      );
  }

  for (
    const registro of
      registros
  ) {
    const maquina =
      normalizarMaquina(
        registro.maquina
      );

    const row =
      PERCENT_MACHINE_ROWS[
        maquina
      ];

    if (
      !row
    ) {
      console.warn(
        `⚠ Máquina ${maquina} no existe en hoja %.`
      );

      continue;
    }

    const columna =
      numeroAColumnaExcel(
        registro.dia +
        1
      );

    const cell =
      sheet.cell(
        `${columna}${row}`
      );

    cell.value(
      registro.cumplimiento
    );

    aplicarFormatoPorcentaje(
      cell
    );

    escritos++;
  }

  return escritos;
}

function generarHojaPorcentaje(
  workbook: any,
  registros: DailyRow[],
  anio: number,
  mes: number
): number {
  const sheet =
    workbook.sheet(
      "%"
    );

  if (
    !sheet
  ) {
    throw new Error(
      'No existe hoja "%".'
    );
  }

  limpiarHojaPorcentaje(
    sheet
  );

  escribirEncabezadoPorcentaje(
    sheet,
    anio,
    mes
  );

  return escribirMatrizPorcentaje(
    sheet,
    registros
  );
}

/* =========================================================
   LIMPIEZA DE FÓRMULAS HEREDADAS ROTAS
========================================================= */

function limpiarReferenciasRotasEnHoja(
  sheet: any
): number {
  const usedRange =
    sheet.usedRange();

  if (
    !usedRange
  ) {
    return 0;
  }

  let limpiadas =
    0;

  usedRange.forEach(
    (
      cell: any
    ) => {
      let formula:
        unknown;

      let valor:
        unknown;

      try {
        formula =
          cell.formula();
      } catch {
        formula =
          undefined;
      }

      try {
        valor =
          cell.value();
      } catch {
        valor =
          undefined;
      }

      const formulaTexto =
        typeof formula ===
        "string"
          ? formula
          : "";

      const valorTexto =
        typeof valor ===
        "string"
          ? valor
          : "";

      if (
        formulaTexto.includes(
          "#REF!"
        ) ||
        valorTexto.includes(
          "#REF!"
        )
      ) {
        cell.value(
          undefined
        );

        limpiadas++;
      }
    }
  );

  return limpiadas;
}

function limpiarReferenciasRotasHeredadas(
  workbook: any
): number {
  let total =
    0;

  for (
    const nombre of
      [
        "Resumen",
        "Congelado Sem",
      ]
  ) {
    const sheet =
      workbook.sheet(
        nombre
      );

    if (
      !sheet
    ) {
      continue;
    }

    const cantidad =
      limpiarReferenciasRotasEnHoja(
        sheet
      );

    total +=
      cantidad;

    if (
      cantidad >
      0
    ) {
      console.log(
        `  ✓ ${nombre}: ${cantidad} fórmula(s)/celda(s) con #REF! limpiada(s).`
      );
    }
  }

  return total;
}

function ocultarHojasHeredadas(
  workbook: any
): string[] {
  const ocultadas:
    string[] = [];

  for (
    const nombre of
      [
        "29 JUN",
        "30 JUN",
      ]
  ) {
    const sheet =
      workbook.sheet(
        nombre
      );

    if (
      !sheet
    ) {
      continue;
    }

    sheet.hidden(
      true
    );

    ocultadas.push(
      nombre
    );
  }

  return ocultadas;
}

/* =========================================================
   ================= RESUMEN ================================
========================================================= */

function limpiarHojaResumen(
  sheet: any
): void {
  /*
   * Transferido semanal / mensual:
   * todavía no tenemos fuente oficial.
   */
  sheet
    .range(
      "C4:F10"
    )
    .clear({
      contentsOnly:
        true,
    });

  sheet
    .range(
      "H4:K10"
    )
    .clear({
      contentsOnly:
        true,
    });

  /*
   * Resumen principal:
   * N = Plan
   * O = Real
   * P = Diferencia
   * Q = Cumplimiento
   * R = Pérdida $
   */
  for (
    const config of
      Object.values(
        SUMMARY_MACHINE_ROWS
      )
  ) {
    sheet
      .range(
        `N${config.row}:R${config.row}`
      )
      .clear({
        contentsOnly:
          true,
      });
  }

  for (
    const config of
      Object.values(
        SUMMARY_SECTION_ROWS
      )
  ) {
    sheet
      .range(
        `N${config.totalRow}:R${config.totalRow}`
      )
      .clear({
        contentsOnly:
          true,
      });

    sheet
      .cell(
        `O${config.complianceRow}`
      )
      .value(
        undefined
      );
  }

  /*
   * La plantilla histórica deja fórmulas antiguas
   * en las etiquetas del bloque BOLSERA.
   *
   * Las eliminamos para evitar que C. Spout o TOTAL
   * queden mostrando cálculos heredados.
   */
  sheet
    .range(
      "M34:M37"
    )
    .clear({
      contentsOnly:
        true,
    });
}

function escribirMaquinaResumen(
  sheet: any,
  maquina: string,
  registros: DailyRow[]
): boolean {
  const config =
    SUMMARY_MACHINE_ROWS[
      maquina
    ];

  if (
    !config
  ) {
    return false;
  }

  const rows =
    registros.filter(
      (
        row
      ) =>
        normalizarMaquina(
          row.maquina
        ) ===
        maquina
    );

  if (
    rows.length ===
    0
  ) {
    return false;
  }

  const plan =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.plan
        ),
      0
    );

  const real =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.real
        ),
      0
    );

  const diferencia =
    real -
    plan;

  const cumplimiento =
    plan !==
    0
      ? real /
        plan
      : 0;

  const row =
    config.row;

  sheet
    .cell(
      `M${row}`
    )
    .value(
      maquina ===
        "C.SPOUT"
        ? "C. Spout"
        : Number(
            maquina
          )
    );

  const planCell =
    sheet.cell(
      `N${row}`
    );

  const realCell =
    sheet.cell(
      `O${row}`
    );

  const diffCell =
    sheet.cell(
      `P${row}`
    );

  const cumpCell =
    sheet.cell(
      `Q${row}`
    );

  const perdidaCell =
    sheet.cell(
      `R${row}`
    );

  planCell.value(
    plan
  );

  realCell.value(
    real
  );

  diffCell.value(
    diferencia
  );

  cumpCell.value(
    cumplimiento
  );

  /*
   * Regla histórica validada contra el libro original:
   *
   * Pérdida $ = Diferencia × 0.5
   *
   * En Resumen la plantilla histórica aplica esta
   * métrica a IMPRESION y LAMINACION.
   *
   * GRAFILADORA no mostraba Pérdida $ en el
   * Resumen histórico, por lo que se conserva vacía.
   */
  if (
    config.seccion ===
      "IMPRESION" ||
    config.seccion ===
      "LAMINACION"
  ) {
    perdidaCell.value(
      diferencia *
      PERDIDA_FACTOR
    );

    aplicarFormatoMoneda(
      perdidaCell
    );
  } else {
    perdidaCell.value(
      undefined
    );
  }

  aplicarFormatoNumero(
    planCell
  );

  aplicarFormatoNumero(
    realCell
  );

  aplicarFormatoNumero(
    diffCell
  );

  aplicarFormatoPorcentaje(
    cumpCell
  );

  return true;
}

function escribirTotalSeccionResumen(
  sheet: any,
  registros: DailyRow[],
  seccion: string
): void {
  const config =
    SUMMARY_SECTION_ROWS[
      seccion
    ];

  if (
    !config
  ) {
    return;
  }

  const resumen =
    calcularResumenSeccion(
      registros,
      seccion
    );

  if (
    !resumen
  ) {
    return;
  }

  const totalRow =
    config.totalRow;

  const planCell =
    sheet.cell(
      `N${totalRow}`
    );

  const realCell =
    sheet.cell(
      `O${totalRow}`
    );

  const diffCell =
    sheet.cell(
      `P${totalRow}`
    );

  const perdidaCell =
    sheet.cell(
      `R${totalRow}`
    );

  planCell.value(
    resumen.plan
  );

  realCell.value(
    resumen.real
  );

  diffCell.value(
    resumen.diferencia
  );

  if (
    seccion ===
      "IMPRESION" ||
    seccion ===
      "LAMINACION"
  ) {
    perdidaCell.value(
      resumen.diferencia *
      PERDIDA_FACTOR
    );

    aplicarFormatoMoneda(
      perdidaCell
    );
  } else {
    perdidaCell.value(
      undefined
    );
  }

  aplicarFormatoNumero(
    planCell
  );

  aplicarFormatoNumero(
    realCell
  );

  aplicarFormatoNumero(
    diffCell
  );

  sheet
    .cell(
      `M${config.complianceRow}`
    )
    .value(
      config.label
    );

  const cumplimientoCell =
    sheet.cell(
      `O${config.complianceRow}`
    );

  cumplimientoCell.value(
    resumen.cumplimiento
  );

  aplicarFormatoPorcentaje(
    cumplimientoCell
  );
}

function generarHojaResumen(
  workbook: any,
  registros: DailyRow[],
  anio: number,
  mes: number
): {
  maquinas: number;
  secciones: number;
} {
  const sheet =
    workbook.sheet(
      "Resumen"
    );

  if (
    !sheet
  ) {
    throw new Error(
      'No existe hoja "Resumen".'
    );
  }

  limpiarHojaResumen(
    sheet
  );

  /*
   * Encabezados de sección.
   */
  sheet
    .cell(
      "M2"
    )
    .value(
      "IMPRESION"
    );

  sheet
    .cell(
      "M11"
    )
    .value(
      "LAMINACION"
    );

  sheet
    .cell(
      "M23"
    )
    .value(
      "GRAFILADORA"
    );

  sheet
    .cell(
      "M33"
    )
    .value(
      "BOLSERA"
    );

  const headerRows = [
    2,
    11,
    23,
    33,
  ];

  for (
    const row of
      headerRows
  ) {
    const unidad =
      row ===
      23
        ? "kg"
        : "m";

    sheet
      .cell(
        `N${row}`
      )
      .value(
        `Plan (${unidad})`
      );

    sheet
      .cell(
        `O${row}`
      )
      .value(
        `Real (${unidad})`
      );

    sheet
      .cell(
        `P${row}`
      )
      .value(
        "Dif"
      );

    sheet
      .cell(
        `Q${row}`
      )
      .value(
        "Cump %"
      );

    sheet
      .cell(
        `R${row}`
      )
      .value(
        "Perdida $"
      );
  }

  let maquinasEscritas =
    0;

  for (
    const maquina of
      Object.keys(
        SUMMARY_MACHINE_ROWS
      )
  ) {
    if (
      escribirMaquinaResumen(
        sheet,
        maquina,
        registros
      )
    ) {
      maquinasEscritas++;
    }
  }

  /*
   * Etiquetas estables del bloque BOLSERA.
   * C. Spout debe seguir apareciendo aunque el mes
   * no tenga producción.
   */
  sheet
    .cell(
      "M34"
    )
    .value(
      476
    );

  sheet
    .cell(
      "M35"
    )
    .value(
      478
    );

  sheet
    .cell(
      "M36"
    )
    .value(
      "C. Spout"
    );

  sheet
    .cell(
      "M37"
    )
    .value(
      "TOTAL"
    );

  const secciones = [
    "IMPRESION",
    "LAMINACION",
    "GRAFILADORA",
    "BOLSERA",
  ];

  for (
    const seccion of
      secciones
  ) {
    escribirTotalSeccionResumen(
      sheet,
      registros,
      seccion
    );
  }

  /*
   * Títulos de Transferido.
   */
  sheet
    .cell(
      "B2"
    )
    .value(
      "Transferido Semanal"
    );

  sheet
    .cell(
      "H2"
    )
    .value(
      "Transferido Mensual"
    );

  console.log(
    `  Resumen correspondiente a ${MONTH_NAMES_UPPER[mes]} ${anio}`
  );

  console.log(
    `  ✓ Pérdida $ aplicada: Diferencia × ${PERDIDA_FACTOR}.`
  );

  console.log(
    "  ✓ BOLSERA integrada desde DRIVE_BOLSERA."
  );

  console.log(
    "  ⚠ Transferido pendiente de identificar fuente/regla."
  );

  return {
    maquinas:
      maquinasEscritas,

    secciones:
      secciones.length,
  };
}


/* =========================================================
   ================= ANUAL ==================================

   Estrategia:
   - preserva todo el histórico existente;
   - limpia únicamente el mes/año solicitado;
   - actualiza filas existentes;
   - agrega máquinas que no existan en el bloque mensual;
   - mantiene una fila Meta = 100%;
   - Pérdida $ queda pendiente de validación funcional.
========================================================= */

function normalizarTextoAnual(
  valor: unknown
): string {
  return String(
    valor ?? ""
  )
    .trim()
    .toUpperCase()
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    );
}

/* =========================================================
   NORMALIZAR MES EN HOJA ANUAL

   La plantilla histórica puede contener:

   "09 Septiembre"
   "09 Septiembre "
   "Septiembre"
   "09- Septiembre"

   Todos deben considerarse el mismo mes.
========================================================= */

function normalizarMesAnual(
  valor: unknown
): string {
  return normalizarTextoAnual(
    valor
  )
    .replace(
      /^\d{1,2}\s*[-./]?\s*/,
      ""
    )
    .trim();
}

function tipoAnualPorSeccion(
  seccion: string,
  maquina?: string
): string {
  if (
    normalizarMaquina(
      maquina
    ) ===
    "C.SPOUT"
  ) {
    return "C. Spout";
  }

  switch (
    seccion
  ) {
    case "IMPRESION":
      return "Impresora";

    case "LAMINACION":
      return "Laminadora";

    case "GRAFILADORA":
      return "Grafiladora";

    case "BOLSERA":
      return "Bolsera";

    default:
      return seccion;
  }
}

const ANUAL_STYLE_KEYS = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "fontSize",
  "fontFamily",
  "fontColor",
  "fill",
  "horizontalAlignment",
  "verticalAlignment",
  "wrapText",
  "shrinkToFit",
  "numberFormat",
  "border",
];

function copiarEstiloFilaAnual(
  sheet: any,
  sourceRow: number,
  targetRow: number
): void {
  const source =
    sheet.range(
      `A${sourceRow}:I${sourceRow}`
    );

  const target =
    sheet.range(
      `A${targetRow}:I${targetRow}`
    );

  try {
    const styles =
      source.style(
        ANUAL_STYLE_KEYS
      );

    target.style(
      styles
    );
  } catch {
    /*
     * Si algún estilo heredado no puede copiarse,
     * los formatos numéricos oficiales se aplican
     * posteriormente al escribir la fila.
     */
  }

  try {
    const height =
      sheet
        .row(
          sourceRow
        )
        .height();

    if (
      height !==
      undefined &&
      height !==
      null
    ) {
      sheet
        .row(
          targetRow
        )
        .height(
          height
        );
    }
  } catch {
    // No bloquear la generación por altura heredada.
  }
}

function desplazarFilasAnual(
  sheet: any,
  desdeRow: number,
  cantidad: number
): void {
  if (
    cantidad <=
    0
  ) {
    return;
  }

  const ultimaFila =
    ultimaFilaConDatosAnual(
      sheet
    );

  /*
   * XlsxPopulate no dispone de inserción de filas.
   * Reproducimos el comportamiento desplazando el bloque
   * desde abajo hacia arriba. Para Anual conservamos los
   * valores históricos (no dependemos de fórmulas heredadas).
   */
  for (
    let sourceRow =
      ultimaFila;
    sourceRow >=
      desdeRow;
    sourceRow--
  ) {
    const targetRow =
      sourceRow +
      cantidad;

    const source =
      sheet.range(
        `A${sourceRow}:I${sourceRow}`
      );

    const target =
      sheet.range(
        `A${targetRow}:I${targetRow}`
      );

    const values =
      source.value();

    copiarEstiloFilaAnual(
      sheet,
      sourceRow,
      targetRow
    );

    target.value(
      values
    );
  }

  /*
   * Liberar las nuevas filas del bloque.
   */
  for (
    let row =
      desdeRow;
    row <
      desdeRow +
      cantidad;
    row++
  ) {
    sheet
      .range(
        `A${row}:I${row}`
      )
      .clear({
        contentsOnly:
          true,
      });
  }

  /*
   * Las nuevas filas deben verse como filas de producción,
   * no como una antigua fila Meta.
   */
  const styleSourceRow =
    Math.max(
      2,
      desdeRow -
      1
    );

  for (
    let row =
      desdeRow;
    row <
      desdeRow +
      cantidad;
    row++
  ) {
    copiarEstiloFilaAnual(
      sheet,
      styleSourceRow,
      row
    );
  }
}

function buscarFilaAnual(
  sheet: any,
  anio: number,
  mes: number,
  maquina: string
):
number | null {
  const mesObjetivo =
    normalizarMesAnual(
      MONTH_NAMES[
        mes
      ]
    );

  const maquinaObjetivo =
    normalizarMaquina(
      maquina
    );

  /*
   * Margen amplio para permitir histórico
   * adicional sin depender de una fila fija.
   */
  for (
    let row = 2;
    row <= 1000;
    row++
  ) {
    const valorMes =
      normalizarMesAnual(
        sheet
          .cell(
            `A${row}`
          )
          .value()
      );

    const valorAnio =
      Number(
        sheet
          .cell(
            `B${row}`
          )
          .value()
      );

    const valorMaquina =
      normalizarMaquina(
        sheet
          .cell(
            `D${row}`
          )
          .value()
      );

    if (
      valorMes ===
        mesObjetivo &&
      valorAnio ===
        anio &&
      valorMaquina ===
        maquinaObjetivo
    ) {
      return row;
    }
  }

  return null;
}

function buscarFilaMetaAnual(
  sheet: any,
  anio: number,
  mes: number
):
number | null {
  const mesObjetivo =
    normalizarMesAnual(
      MONTH_NAMES[
        mes
      ]
    );

  for (
    let row = 2;
    row <= 1000;
    row++
  ) {
    const valorMes =
      normalizarMesAnual(
        sheet
          .cell(
            `A${row}`
          )
          .value()
      );

    const valorAnio =
      Number(
        sheet
          .cell(
            `B${row}`
          )
          .value()
      );

    const tipo =
      normalizarTextoAnual(
        sheet
          .cell(
            `C${row}`
          )
          .value()
      );

    const maquina =
      normalizarTextoAnual(
        sheet
          .cell(
            `D${row}`
          )
          .value()
      );

    if (
      valorMes ===
        mesObjetivo &&
      valorAnio ===
        anio &&
      tipo ===
        "META" &&
      maquina ===
        "META"
    ) {
      return row;
    }
  }

  return null;
}

function ultimaFilaConDatosAnual(
  sheet: any
): number {
  let ultima =
    1;

  for (
    let row = 2;
    row <= 1000;
    row++
  ) {
    const valores = [
      sheet
        .cell(
          `A${row}`
        )
        .value(),

      sheet
        .cell(
          `B${row}`
        )
        .value(),

      sheet
        .cell(
          `C${row}`
        )
        .value(),

      sheet
        .cell(
          `D${row}`
        )
        .value(),
    ];

    const tieneDatos =
      valores.some(
        (
          valor
        ) =>
          valor !==
            undefined &&
          valor !==
            null &&
          String(
            valor
          ).trim() !==
            ""
      );

    if (
      tieneDatos
    ) {
      ultima =
        row;
    }
  }

  return ultima;
}

function limpiarPeriodoAnual(
  sheet: any,
  anio: number,
  mes: number
): number {
  const mesObjetivo =
    normalizarMesAnual(
      MONTH_NAMES[
        mes
      ]
    );

  let filasLimpiadas =
    0;

  for (
    let row = 2;
    row <= 1000;
    row++
  ) {
    const valorMes =
      normalizarMesAnual(
        sheet
          .cell(
            `A${row}`
          )
          .value()
      );

    const valorAnio =
      Number(
        sheet
          .cell(
            `B${row}`
          )
          .value()
      );

    const tipo =
      normalizarTextoAnual(
        sheet
          .cell(
            `C${row}`
          )
          .value()
      );

    if (
      valorMes ===
        mesObjetivo &&
      valorAnio ===
        anio &&
      tipo !==
        "META"
    ) {
      sheet
        .range(
          `E${row}:I${row}`
        )
        .clear({
          contentsOnly:
            true,
        });

      filasLimpiadas++;
    }
  }

  return filasLimpiadas;
}

function escribirFilaAnual(
  sheet: any,
  row: number,
  anio: number,
  mes: number,
  maquina: string,
  seccion: string,
  plan: number,
  real: number
): void {
  const diferencia =
    real -
    plan;

  const cumplimiento =
    plan !==
    0
      ? real /
        plan
      : 0;

  sheet
    .cell(
      `A${row}`
    )
    .value(
      `${String(
        mes
      ).padStart(
        2,
        "0"
      )} ${
        MONTH_NAMES[
          mes
        ].charAt(
          0
        ).toUpperCase() +
        MONTH_NAMES[
          mes
        ].slice(
          1
        )
      }`
    );

  sheet
    .cell(
      `B${row}`
    )
    .value(
      anio
    );

  sheet
    .cell(
      `C${row}`
    )
    .value(
      tipoAnualPorSeccion(
        seccion,
        maquina
      )
    );

  sheet
    .cell(
      `D${row}`
    )
    .value(
      maquina ===
        "C.SPOUT"
        ? "C. Spout"
        : Number(
            maquina
          )
    );

  const planCell =
    sheet.cell(
      `E${row}`
    );

  const realCell =
    sheet.cell(
      `F${row}`
    );

  const diffCell =
    sheet.cell(
      `G${row}`
    );

  const cumpCell =
    sheet.cell(
      `H${row}`
    );

  const perdidaCell =
    sheet.cell(
      `I${row}`
    );

  planCell.value(
    plan
  );

  realCell.value(
    real
  );

  diffCell.value(
    diferencia
  );

  cumpCell.value(
    cumplimiento
  );

  /*
   * La regla de Pérdida $ se conserva para las
   * secciones donde históricamente estaba aplicada.
   *
   * BOLSERA mantiene Pérdida $ vacía porque en el
   * histórico sus filas solo registran Plan / Real.
   */
  if (
    seccion !==
    "BOLSERA"
  ) {
    perdidaCell.value(
      diferencia *
      PERDIDA_FACTOR
    );

    aplicarFormatoMoneda(
      perdidaCell
    );
  } else {
    perdidaCell.value(
      undefined
    );
  }

  aplicarFormatoNumero(
    planCell
  );

  aplicarFormatoNumero(
    realCell
  );

  aplicarFormatoNumero(
    diffCell
  );

  aplicarFormatoPorcentaje(
    cumpCell
  );
}

function escribirMetaAnual(
  sheet: any,
  row: number,
  anio: number,
  mes: number
): void {
  sheet
    .cell(
      `A${row}`
    )
    .value(
      `${String(
        mes
      ).padStart(
        2,
        "0"
      )} ${
        MONTH_NAMES[
          mes
        ].charAt(
          0
        ).toUpperCase() +
        MONTH_NAMES[
          mes
        ].slice(
          1
        )
      }`
    );

  sheet
    .cell(
      `B${row}`
    )
    .value(
      anio
    );

  sheet
    .cell(
      `C${row}`
    )
    .value(
      "Meta"
    );

  sheet
    .cell(
      `D${row}`
    )
    .value(
      "Meta"
    );

  sheet
    .cell(
      `E${row}`
    )
    .value(
      undefined
    );

  sheet
    .cell(
      `F${row}`
    )
    .value(
      undefined
    );

  sheet
    .cell(
      `G${row}`
    )
    .value(
      0
    );

  const metaCell =
    sheet.cell(
      `H${row}`
    );

  metaCell.value(
    1
  );

  aplicarFormatoPorcentaje(
    metaCell
  );

  /*
   * La fila Meta no representa producción,
   * por lo que Pérdida $ permanece vacía.
   */
  sheet
    .cell(
      `I${row}`
    )
    .value(
      undefined
    );
}

function generarHojaAnual(
  workbook: any,
  registros: DailyRow[],
  anio: number,
  mes: number
): {
  actualizadas: number;
  agregadas: number;
  metaRow: number;
  limpiadas: number;
} {
  const sheet =
    workbook.sheet(
      "Anual"
    );

  if (
    !sheet
  ) {
    throw new Error(
      'No existe hoja "Anual".'
    );
  }

  /*
   * Encabezados oficiales.
   */
  sheet
    .range(
      "A1:I1"
    )
    .value([
      [
        "Mes",
        "Año",
        "Tipo",
        "Máquina",
        "Metros plan",
        "Metros reales",
        "Diferencia",
        "Cumpl",
        "Perdida $",
      ],
    ]);

  /*
   * Limpiar únicamente el período solicitado.
   * El resto del histórico permanece intacto.
   */
  const limpiadas =
    limpiarPeriodoAnual(
      sheet,
      anio,
      mes
    );

  /*
   * Consolidado por máquina.
   */
  const porMaquina =
    new Map<
      string,
      {
        maquina: string;
        seccion: string;
        plan: number;
        real: number;
      }
    >();

  for (
    const registro of
      registros
  ) {
    const maquina =
      normalizarMaquina(
        registro.maquina
      );

    const existente =
      porMaquina.get(
        maquina
      );

    if (
      existente
    ) {
      existente.plan +=
        Number(
          registro.plan
        );

      existente.real +=
        Number(
          registro.real
        );
    } else {
      porMaquina.set(
        maquina,
        {
          maquina,
          seccion:
            registro.seccion,
          plan:
            Number(
              registro.plan
            ),
          real:
            Number(
              registro.real
            ),
        }
      );
    }
  }

  const ordenSeccionAnual:
    Record<string, number> = {
      IMPRESION:
        1,

      LAMINACION:
        2,

      GRAFILADORA:
        3,

      BOLSERA:
        4,
    };

  const items =
    [
      ...porMaquina.values(),
    ].sort(
      (
        a,
        b
      ) =>
        (
          ordenSeccionAnual[
            a.seccion
          ] ??
          999
        ) -
        (
          ordenSeccionAnual[
            b.seccion
          ] ??
          999
        ) ||
        a.maquina.localeCompare(
          b.maquina
        )
    );

  /*
   * Detectar qué máquinas ya tienen fila reservada en el
   * bloque mensual histórico y cuáles son nuevas.
   */
  let metaRow =
    buscarFilaMetaAnual(
      sheet,
      anio,
      mes
    );

  const faltantes =
    items.filter(
      (
        item
      ) =>
        buscarFilaAnual(
          sheet,
          anio,
          mes,
          item.maquina
        ) ===
        null
    );

  /*
   * Si existe Meta, hacemos espacio JUSTO antes de ella.
   *
   * Así las nuevas máquinas quedan dentro del período:
   *
   *   Septiembre
   *     ...
   *     431
   *     476
   *     478
   *     Meta
   *   Octubre
   *
   * y no al final de toda la hoja.
   */
  if (
    metaRow &&
    faltantes.length >
      0
  ) {
    desplazarFilasAnual(
      sheet,
      metaRow,
      faltantes.length
    );

    console.log(
      `  ✓ Se insertó espacio lógico para ${faltantes.length} máquina(s) antes de Meta.`
    );
  }

  let actualizadas =
    0;

  let agregadas =
    0;

  let siguienteFilaNueva =
    metaRow ??
    (
      ultimaFilaConDatosAnual(
        sheet
      ) +
      1
    );

  for (
    const item of
      items
  ) {
    let row =
      buscarFilaAnual(
        sheet,
        anio,
        mes,
        item.maquina
      );

    if (
      row
    ) {
      actualizadas++;
    } else {
      row =
        siguienteFilaNueva;

      siguienteFilaNueva++;

      agregadas++;

      const styleSourceRow =
        Math.max(
          2,
          row -
          1
        );

      copiarEstiloFilaAnual(
        sheet,
        styleSourceRow,
        row
      );
    }

    escribirFilaAnual(
      sheet,
      row,
      anio,
      mes,
      item.maquina,
      item.seccion,
      item.plan,
      item.real
    );
  }

  /*
   * Meta queda inmediatamente después de todas las máquinas
   * del período. Si originalmente existía, ya fue desplazada.
   */
  if (
    metaRow
  ) {
    metaRow +=
      faltantes.length;
  } else {
    metaRow =
      siguienteFilaNueva;
  }

  escribirMetaAnual(
    sheet,
    metaRow,
    anio,
    mes
  );

  console.log(
    `  Histórico previo preservado. Solo se actualizó ${MONTH_NAMES_UPPER[mes]} ${anio}.`
  );

  console.log(
    `  Filas reservadas detectadas/actualizadas: ${actualizadas}`
  );

  if (
    agregadas >
    0
  ) {
    console.log(
      `  ✓ ${agregadas} fila(s) nueva(s) integrada(s) dentro del bloque ${MONTH_NAMES_UPPER[mes]} ${anio}.`
    );
  }

  console.log(
    `  ✓ Meta quedó inmediatamente después del bloque mensual (fila ${metaRow}).`
  );

  console.log(
    `  ✓ Pérdida $ aplicada en Anual a secciones con regla histórica: Diferencia × ${PERDIDA_FACTOR}.`
  );

  console.log(
    "  ✓ BOLSERA integrada en Anual; Pérdida $ se conserva vacía para esa sección."
  );

  return {
    actualizadas,
    agregadas,
    metaRow,
    limpiadas,
  };
}


/* =========================================================
   VALIDACIÓN MENSUAL
========================================================= */

function mostrarResumenMensual(
  registros: DailyRow[]
): void {
  const maquinas =
    [
      ...new Set(
        registros.map(
          (
            row
          ) =>
            normalizarMaquina(
              row.maquina
            )
        )
      ),
    ].sort();

  console.log(
    "\nResumen mensual:"
  );

  for (
    const maquina of
      maquinas
  ) {
    const rows =
      registros.filter(
        (
          row
        ) =>
          normalizarMaquina(
            row.maquina
          ) ===
          maquina
      );

    const plan =
      rows.reduce(
        (
          total,
          row
        ) =>
          total +
          Number(
            row.plan
          ),
        0
      );

    const real =
      rows.reduce(
        (
          total,
          row
        ) =>
          total +
          Number(
            row.real
          ),
        0
      );

    const cumplimiento =
      plan !==
      0
        ? real /
          plan
        : 0;

    console.log(
      [
        maquina.padEnd(
          8
        ),

        `Plan=${plan.toFixed(
          3
        ).padStart(
          14
        )}`,

        `Real=${real.toFixed(
          3
        ).padStart(
          14
        )}`,

        `Cump=${(
          cumplimiento *
          100
        ).toFixed(
          2
        )}%`,
      ].join(
        " | "
      )
    );
  }
}

/* =========================================================
   REPARAR METADATOS OOXML
========================================================= */

async function repararMetadatosXlsx(
  archivoPath: string
): Promise<void> {
  const buffer =
    fs.readFileSync(
      archivoPath
    );

  const zip =
    await JSZip.loadAsync(
      buffer
    );

  const appXml =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties
 xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Excel</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0300</AppVersion>
</Properties>`;

  const fechaIso =
    new Date()
      .toISOString();

  const coreXml =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties
 xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:dcmitype="http://purl.org/dc/dcmitype/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Sistema Cumplimiento Producción</dc:creator>
  <cp:lastModifiedBy>Sistema Cumplimiento Producción</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${fechaIso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${fechaIso}</dcterms:modified>
</cp:coreProperties>`;

  zip.file(
    "docProps/app.xml",
    appXml
  );

  zip.file(
    "docProps/core.xml",
    coreXml
  );

  /* =======================================================
     REPARAR ORIGEN DE PIVOTS BASADOS EN "Anual"

     La plantilla heredada contiene más de un pivot cache.
     Uno de ellos aún apunta a A1:I249, por lo que una fila
     nueva (por ejemplo 431 en la fila 250) queda fuera.

     Normalizamos cualquier worksheetSource que use la hoja
     Anual para que tome el rango completo reservado por la
     tabla histórica: A1:I9338.

     También forzamos refreshOnLoad="1" para que Excel
     refresque la tabla dinámica al abrir el archivo.
  ======================================================= */

  const PIVOT_ANUAL_REF =
    "A1:I9338";

  const pivotCacheFiles =
    Object.keys(
      zip.files
    ).filter(
      (
        nombre
      ) =>
        /^xl\/pivotCache\/pivotCacheDefinition\d+\.xml$/i.test(
          nombre
        )
    );

  let pivotsReparados =
    0;

  for (
    const nombre of
      pivotCacheFiles
  ) {
    const archivo =
      zip.file(
        nombre
      );

    if (
      !archivo
    ) {
      continue;
    }

    const xmlOriginal =
      await archivo.async(
        "string"
      );

    let xml =
      xmlOriginal;

    /*
     * Solo intervenimos caches cuyo worksheetSource
     * declara explícitamente sheet="Anual".
     *
     * Se conserva cualquier atributo adicional.
     */
    xml =
      xml.replace(
        /<worksheetSource\b([^>]*\bsheet="Anual"[^>]*)\/>/gi,
        (
          match,
          attrs
        ) => {
          let nuevosAttrs =
            String(
              attrs
            );

          if (
            /\bref="[^"]*"/i.test(
              nuevosAttrs
            )
          ) {
            nuevosAttrs =
              nuevosAttrs.replace(
                /\bref="[^"]*"/i,
                `ref="${PIVOT_ANUAL_REF}"`
              );
          } else {
            nuevosAttrs =
              `${nuevosAttrs} ref="${PIVOT_ANUAL_REF}"`;
          }

          return `<worksheetSource${nuevosAttrs}/>`;
        }
      );

    /*
     * Refuerzo para variantes donde worksheetSource
     * no sea autocerrado.
     */
    xml =
      xml.replace(
        /<worksheetSource\b([^>]*\bsheet="Anual"[^>]*)>/gi,
        (
          match,
          attrs
        ) => {
          let nuevosAttrs =
            String(
              attrs
            );

          if (
            /\bref="[^"]*"/i.test(
              nuevosAttrs
            )
          ) {
            nuevosAttrs =
              nuevosAttrs.replace(
                /\bref="[^"]*"/i,
                `ref="${PIVOT_ANUAL_REF}"`
              );
          } else {
            nuevosAttrs =
              `${nuevosAttrs} ref="${PIVOT_ANUAL_REF}"`;
          }

          return `<worksheetSource${nuevosAttrs}>`;
        }
      );

    /*
     * refreshOnLoad pertenece a pivotCacheDefinition.
     */
    if (
      /<pivotCacheDefinition\b/i.test(
        xml
      )
    ) {
      if (
        /\brefreshOnLoad="[^"]*"/i.test(
          xml
        )
      ) {
        xml =
          xml.replace(
            /\brefreshOnLoad="[^"]*"/i,
            'refreshOnLoad="1"'
          );
      } else {
        xml =
          xml.replace(
            /<pivotCacheDefinition\b/i,
            '<pivotCacheDefinition refreshOnLoad="1"'
          );
      }
    }

    if (
      xml !==
      xmlOriginal
    ) {
      zip.file(
        nombre,
        xml
      );

      pivotsReparados++;
    }
  }

  if (
    pivotsReparados >
    0
  ) {
    console.log(
      `✓ Origen de pivot(s) Anual reparado: ${pivotsReparados}`
    );

    console.log(
      `✓ Rango pivot Anual: ${PIVOT_ANUAL_REF}`
    );
  } else {
    console.log(
      "ℹ No fue necesario modificar cachés pivot de Anual."
    );
  }

  /* =======================================================
     FORZAR RECÁLCULO COMPLETO AL ABRIR EN EXCEL

     Las hojas "Gráfica" y "2025 VS 2026" se alimentan de
     tablas dinámicas basadas en "Anual". Aunque los caches
     ya tienen refreshOnLoad=1, también dejamos el libro en
     cálculo automático y solicitamos recálculo completo.

     Esto evita depender de valores cacheados viejos en:
     - tablas dinámicas,
     - fórmulas,
     - gráficos que consumen dichas tablas.
  ======================================================= */

  const workbookXmlFile =
    zip.file(
      "xl/workbook.xml"
    );

  if (
    workbookXmlFile
  ) {
    let workbookXml =
      await workbookXmlFile.async(
        "string"
      );

    if (
      /<calcPr\b/i.test(
        workbookXml
      )
    ) {
      workbookXml =
        workbookXml.replace(
          /<calcPr\b([^>]*)\/>/i,
          (
            match,
            attrs
          ) => {
            let nuevosAttrs =
              String(
                attrs
              );

            const upsertAttr =
              (
                nombre: string,
                valor: string
              ) => {
                const regex =
                  new RegExp(
                    `\\b${nombre}="[^"]*"`,
                    "i"
                  );

                if (
                  regex.test(
                    nuevosAttrs
                  )
                ) {
                  nuevosAttrs =
                    nuevosAttrs.replace(
                      regex,
                      `${nombre}="${valor}"`
                    );
                } else {
                  nuevosAttrs +=
                    ` ${nombre}="${valor}"`;
                }
              };

            upsertAttr(
              "calcMode",
              "auto"
            );

            upsertAttr(
              "fullCalcOnLoad",
              "1"
            );

            upsertAttr(
              "forceFullCalc",
              "1"
            );

            return `<calcPr${nuevosAttrs}/>`;
          }
        );
    } else {
      workbookXml =
        workbookXml.replace(
          /<\/workbook>/i,
          '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>'
        );
    }

    zip.file(
      "xl/workbook.xml",
      workbookXml
    );

    console.log(
      "✓ Recálculo completo de Excel configurado al abrir."
    );
  }

  /* =======================================================
     ELIMINAR CALCCHAIN HEREDADO

     Como el libro fuerza recálculo total, calcChain puede
     contener referencias obsoletas de la plantilla. Excel
     lo reconstruirá al abrir.
  ======================================================= */

  if (
    zip.file(
      "xl/calcChain.xml"
    )
  ) {
    zip.remove(
      "xl/calcChain.xml"
    );

    const workbookRelsFile =
      zip.file(
        "xl/_rels/workbook.xml.rels"
      );

    if (
      workbookRelsFile
    ) {
      let workbookRels =
        await workbookRelsFile.async(
          "string"
        );

      workbookRels =
        workbookRels.replace(
          /<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/>/gi,
          ""
        );

      zip.file(
        "xl/_rels/workbook.xml.rels",
        workbookRels
      );
    }

    const contentTypesFile =
      zip.file(
        "[Content_Types].xml"
      );

    if (
      contentTypesFile
    ) {
      let contentTypes =
        await contentTypesFile.async(
          "string"
        );

      contentTypes =
        contentTypes.replace(
          /<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/gi,
          ""
        );

      zip.file(
        "[Content_Types].xml",
        contentTypes
      );
    }

    console.log(
      "✓ calcChain heredado eliminado; Excel lo reconstruirá."
    );
  }

  /* =======================================================
     SANEAMIENTO OOXML DE FÓRMULAS HEREDADAS ROTAS

     Motivo:
     XlsxPopulate puede conservar la estructura interna de
     una fórmula compartida aunque la celda se haya vaciado
     desde la API. En la plantilla esto ocurre especialmente
     en "Congelado Sem", dejando maestros como:

       <f t="shared" ...>#REF!</f>

     y celdas dependientes que comparten el mismo "si".

     Además, "Congelado Sem" contiene fórmulas históricas
     que apuntan a hojas semanales antiguas (S27 / S28).
     Como Transferido aún no tiene fuente oficial y esta
     hoja está oculta, esas fórmulas no deben sobrevivir en
     el archivo mensual.

     Estrategia:
     1. identificar dinámicamente el XML de "Congelado Sem";
     2. vaciar SOLO celdas que contienen fórmulas en esa hoja,
        preservando sus estilos;
     3. en el resto de worksheets, detectar fórmulas cuyo
        maestro compartido contiene #REF! y limpiar el grupo
        completo;
     4. conservar el resto de celdas, formatos, dibujos,
        pivots y relaciones intactos.
  ======================================================= */

  const workbookRelsSanitizeFile =
    zip.file(
      "xl/_rels/workbook.xml.rels"
    );

  const workbookSanitizeFile =
    zip.file(
      "xl/workbook.xml"
    );

  let congeladoSemXmlPath:
    string | null =
    null;

  if (
    workbookRelsSanitizeFile &&
    workbookSanitizeFile
  ) {
    const workbookXml =
      await workbookSanitizeFile.async(
        "string"
      );

    const workbookRelsXml =
      await workbookRelsSanitizeFile.async(
        "string"
      );

    const sheetMatch =
      workbookXml.match(
        /<sheet\b(?=[^>]*\bname="Congelado Sem")(?=[^>]*\br:id="([^"]+)")[^>]*\/?>/i
      );

    const relId =
      sheetMatch?.[
        1
      ] ??
      null;

    if (
      relId
    ) {
      const escapedRelId =
        relId.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

      const relRegex =
        new RegExp(
          `<Relationship\\b(?=[^>]*\\bId="${escapedRelId}")(?=[^>]*\\bTarget="([^"]+)")[^>]*/?>`,
          "i"
        );

      const relMatch =
        workbookRelsXml.match(
          relRegex
        );

      const target =
        relMatch?.[
          1
        ];

      if (
        target
      ) {
        const normalizado =
          target
            .replace(
              /\\/g,
              "/"
            )
            .replace(
              /^\//,
              ""
            );

        congeladoSemXmlPath =
          normalizado.startsWith(
            "xl/"
          )
            ? normalizado
            : `xl/${normalizado.replace(
                /^\.\//,
                ""
              )}`;
      }
    }
  }

  const worksheetFiles =
    Object.keys(
      zip.files
    ).filter(
      (
        nombre
      ) =>
        /^xl\/worksheets\/sheet\d+\.xml$/i.test(
          nombre
        ) &&
        !zip.files[
          nombre
        ].dir
    );

  /*
   * XlsxPopulate puede clonar una hoja y crear correctamente
   * xl/worksheets/sheetNN.xml, pero no siempre agrega el
   * Override correspondiente en [Content_Types].xml.
   *
   * Sin ese Override, el paquete declara la hoja nueva como
   * application/xml en vez de worksheet+xml y algunos lectores
   * (incluido Excel en escenarios de validación estricta)
   * pueden considerar el XLSX dañado.
   *
   * Normalizamos TODOS los worksheets presentes en el ZIP.
   */
  const contentTypesWorksheetsFile =
    zip.file(
      "[Content_Types].xml"
    );

  if (
    contentTypesWorksheetsFile
  ) {
    let contentTypes =
      await contentTypesWorksheetsFile.async(
        "string"
      );

    let overridesAgregados =
      0;

    for (
      const nombre of
        worksheetFiles
    ) {
      const partName =
        `/${nombre}`;

      const escapedPartName =
        partName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

      const overrideRegex =
        new RegExp(
          `<Override\\b(?=[^>]*\\bPartName="${escapedPartName}")(?=[^>]*\\bContentType="application/vnd\\.openxmlformats-officedocument\\.spreadsheetml\\.worksheet\\+xml")[^>]*/>`,
          "i"
        );

      if (
        overrideRegex.test(
          contentTypes
        )
      ) {
        continue;
      }

      const nuevoOverride =
        `<Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" PartName="${partName}"/>`;

      contentTypes =
        contentTypes.replace(
          /<\/Types>\s*$/i,
          `${nuevoOverride}</Types>`
        );

      overridesAgregados++;
    }

    zip.file(
      "[Content_Types].xml",
      contentTypes
    );

    if (
      overridesAgregados >
      0
    ) {
      console.log(
        `✓ Content Types reparado: ${overridesAgregados} worksheet(s) registrado(s).`
      );
    }
  }

  /*
   * Sanitizar valores numéricos no finitos.
   *
   * XlsxPopulate puede serializar celdas vacías heredadas como
   * <v>NaN</v> al reescribir algunas hojas con contenido histórico.
   * Excel considera esos valores inválidos y repara la hoja al abrir.
   *
   * Conservamos la celda y su estilo, pero dejamos el valor vacío,
   * equivalente al comportamiento de la plantilla original.
   */
  let valoresNoFinitosLimpiados =
    0;

  for (
    const nombre of
      worksheetFiles
  ) {
    const archivoWorksheet =
      zip.file(
        nombre
      );

    if (
      !archivoWorksheet
    ) {
      continue;
    }

    let xmlWorksheet =
      await archivoWorksheet.async(
        "string"
      );

    const coincidencias =
      xmlWorksheet.match(
        /<v>\s*(?:NaN|Infinity|-Infinity)\s*<\/v>/gi
      ) ?? [];

    if (
      coincidencias.length ===
      0
    ) {
      continue;
    }

    valoresNoFinitosLimpiados +=
      coincidencias.length;

    xmlWorksheet =
      xmlWorksheet.replace(
        /<v>\s*(?:NaN|Infinity|-Infinity)\s*<\/v>/gi,
        "<v></v>"
      );

    zip.file(
      nombre,
      xmlWorksheet
    );
  }

  if (
    valoresNoFinitosLimpiados >
    0
  ) {
    console.log(
      `✓ Valores numéricos inválidos saneados: ${valoresNoFinitosLimpiados}.`
    );
  }

  let formulasCongeladoEliminadas =
    0;

  let gruposRefReparados =
    0;

  let celdasRefReparadas =
    0;

  for (
    const nombre of
      worksheetFiles
  ) {
    const archivo =
      zip.file(
        nombre
      );

    if (
      !archivo
    ) {
      continue;
    }

    const xmlOriginal =
      await archivo.async(
        "string"
      );

    let xml =
      xmlOriginal;

    /*
     * Congelado Sem:
     * elimina todas las fórmulas heredadas, no los valores
     * estáticos ni el formato de la hoja.
     *
     * Al reconstruir la celda como <c .../> también quitamos
     * cualquier valor cacheado asociado a la fórmula.
     */
    if (
      congeladoSemXmlPath &&
      nombre ===
        congeladoSemXmlPath
    ) {
      xml =
        xml.replace(
          /<c\b(?![^>]*\/>)([^>]*)>([\s\S]*?)<\/c>/gi,
          (
            cellXml,
            attrs,
            body
          ) => {
            if (
              !/<f\b/i.test(
                String(
                  body
                )
              )
            ) {
              return cellXml;
            }

            formulasCongeladoEliminadas++;

            const attrsLimpios =
              String(
                attrs
              )
                .replace(
                  /\/\s*$/,
                  ""
                )
                .trimEnd();

            return `<c${attrsLimpios}/>`;
          }
        );

      /*
       * La plantilla también conserva reglas de formato
       * condicional antiguas con referencias #REF!.
       *
       * Ejemplo real heredado:
       *
       *   <formula>F28&gt;=#REF!</formula>
       *
       * No son celdas y por eso la limpieza anterior no las
       * elimina. Como pertenecen al bloque histórico de
       * Transferido / Congelado Sem, retiramos únicamente los
       * bloques conditionalFormatting que contienen #REF!,
       * conservando las reglas válidas de la hoja.
       */
      let formatosCondicionalesRotos =
        0;

      xml =
        xml.replace(
          /<conditionalFormatting\b[^>]*>[\s\S]*?<\/conditionalFormatting>/gi,
          (
            block
          ) => {
            if (
              !String(
                block
              ).includes(
                "#REF!"
              )
            ) {
              return block;
            }

            formatosCondicionalesRotos++;

            return "";
          }
        );

      if (
        formatosCondicionalesRotos >
        0
      ) {
        console.log(
          `✓ Congelado Sem: ${formatosCondicionalesRotos} bloque(s) de formato condicional con #REF! eliminado(s).`
        );
      }
    } else if (
      xml.includes(
        "#REF!"
      )
    ) {
      /*
       * Primero identificamos los índices "si" de fórmulas
       * compartidas cuyo maestro contiene #REF!.
       */
      const sharedBroken =
        new Set<
          string
        >();

      const masterRegex =
        /<f\b([^>]*)>([\s\S]*?)<\/f>/gi;

      let formulaMatch:
        RegExpExecArray | null;

      while (
        (
          formulaMatch =
            masterRegex.exec(
              xml
            )
        ) !==
        null
      ) {
        const attrs =
          formulaMatch[
            1
          ] ??
          "";

        const formulaText =
          formulaMatch[
            2
          ] ??
          "";

        if (
          !formulaText.includes(
            "#REF!"
          )
        ) {
          continue;
        }

        const siMatch =
          attrs.match(
            /\bsi="([^"]+)"/i
          );

        if (
          siMatch?.[
            1
          ]
        ) {
          sharedBroken.add(
            siMatch[
              1
            ]
          );
        }
      }

      gruposRefReparados +=
        sharedBroken.size;

      /*
       * Vaciar cualquier celda cuya fórmula sea:
       * - directamente #REF!, o
       * - integrante de un grupo compartido roto.
       *
       * Se conserva r/s/etc. en <c> para no perder estilo.
       */
      xml =
        xml.replace(
          /<c\b(?![^>]*\/>)([^>]*)>([\s\S]*?)<\/c>/gi,
          (
            cellXml,
            attrs,
            body
          ) => {
            const bodyText =
              String(
                body
              );

            const formula =
              bodyText.match(
                /<f\b([^>]*)>([\s\S]*?)<\/f>|<f\b([^>]*)\/>/i
              );

            if (
              !formula
            ) {
              if (
                bodyText.includes(
                  "#REF!"
                )
              ) {
                celdasRefReparadas++;

                const attrsLimpios =
              String(
                attrs
              )
                .replace(
                  /\/\s*$/,
                  ""
                )
                .trimEnd();

            return `<c${attrsLimpios}/>`;
              }

              return cellXml;
            }

            const formulaAttrs =
              formula[
                1
              ] ??
              formula[
                3
              ] ??
              "";

            const formulaText =
              formula[
                2
              ] ??
              "";

            const siMatch =
              formulaAttrs.match(
                /\bsi="([^"]+)"/i
              );

            const sharedSi =
              siMatch?.[
                1
              ] ??
              null;

            const rota =
              formulaText.includes(
                "#REF!"
              ) ||
              (
                sharedSi !==
                  null &&
                sharedBroken.has(
                  sharedSi
                )
              );

            if (
              !rota
            ) {
              return cellXml;
            }

            celdasRefReparadas++;

            const attrsLimpios =
              String(
                attrs
              )
                .replace(
                  /\/\s*$/,
                  ""
                )
                .trimEnd();

            return `<c${attrsLimpios}/>`;
          }
        );
    }

    if (
      xml !==
      xmlOriginal
    ) {
      zip.file(
        nombre,
        xml
      );
    }
  }

  if (
    formulasCongeladoEliminadas >
    0
  ) {
    console.log(
      `✓ Congelado Sem saneado a nivel OOXML: ${formulasCongeladoEliminadas} fórmula(s) heredada(s) eliminada(s).`
    );
  }

  if (
    gruposRefReparados >
      0 ||
    celdasRefReparadas >
      0
  ) {
    console.log(
      `✓ Fórmulas #REF! saneadas a nivel OOXML: ${celdasRefReparadas} celda(s), ${gruposRefReparados} grupo(s) compartido(s).`
    );
  }

  /* =======================================================
     VALIDACIÓN ESTRUCTURAL BÁSICA OOXML

     Una celda ya autocerrada (<c .../>) nunca debe volver a
     reconstruirse como <c ...//>. Este control detecta ese
     patrón antes de guardar el archivo final.
  ======================================================= */

  const xmlConCierreDoble:
    string[] = [];

  for (
    const nombre of
      Object.keys(
        zip.files
      )
  ) {
    if (
      !/\.(xml|rels)$/i.test(
        nombre
      ) ||
      zip.files[
        nombre
      ].dir
    ) {
      continue;
    }

    const archivo =
      zip.file(
        nombre
      );

    if (
      !archivo
    ) {
      continue;
    }

    const xml =
      await archivo.async(
        "string"
      );

    if (
      /<[^>]*\/\/>/i.test(
        xml
      )
    ) {
      xmlConCierreDoble.push(
        nombre
      );
    }
  }

  if (
    xmlConCierreDoble.length >
    0
  ) {
    throw new Error(
      [
        "El XLSX contiene etiquetas XML autocerradas inválidas (//>).",
        "Archivos OOXML:",
        ...xmlConCierreDoble.map(
          (
            nombre
          ) =>
            `- ${nombre}`
        ),
      ].join(
        "\\n"
      )
    );
  }

  console.log(
    "✓ Validación estructural OOXML: sin cierres XML dobles."
  );

  /* =======================================================
     VALIDAR QUE NO SOBREVIVA NINGÚN #REF!
  ======================================================= */

  const archivosXml =
    Object.keys(
      zip.files
    ).filter(
      (
        nombre
      ) =>
        (
          nombre.endsWith(
            ".xml"
          ) ||
          nombre.endsWith(
            ".rels"
          )
        ) &&
        !zip.files[
          nombre
        ].dir
    );

  const referenciasRotas:
    string[] = [];

  for (
    const nombre of
      archivosXml
  ) {
    const archivo =
      zip.file(
        nombre
      );

    if (
      !archivo
    ) {
      continue;
    }

    const xml =
      await archivo.async(
        "string"
      );

    if (
      xml.includes(
        "#REF!"
      )
    ) {
      referenciasRotas.push(
        nombre
      );
    }
  }

  if (
    referenciasRotas.length >
    0
  ) {
    throw new Error(
      [
        "El XLSX todavía contiene referencias #REF!.",
        "Archivos OOXML:",
        ...referenciasRotas.map(
          (
            nombre
          ) =>
            `- ${nombre}`
        ),
      ].join(
        "\n"
      )
    );
  }

  console.log(
    "✓ Validación #REF!: 0 referencias rotas."
  );

  const reparado =
    await zip.generateAsync({
      type:
        "nodebuffer",

      compression:
        "DEFLATE",
    });

  fs.writeFileSync(
    archivoPath,
    reparado
  );
}

/* =========================================================
   MAIN
========================================================= */

async function main():
Promise<void> {
  const {
    anio,
    mes,
  } =
    leerArgumentos();

  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "GENERADOR EXCEL V3.3.3 - CUMPLIMIENTO PRODUCCION"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `Periodo: ${anio}-${String(
      mes
    ).padStart(
      2,
      "0"
    )}`
  );

  if (
    !fs.existsSync(
      TEMPLATE_PATH
    )
  ) {
    throw new Error(
      `No existe plantilla:\n${TEMPLATE_PATH}`
    );
  }

  const registros =
    obtenerDatos(
      anio,
      mes
    );

  if (
    registros.length ===
    0
  ) {
    throw new Error(
      `No existen registros para ${anio}-${String(
        mes
      ).padStart(
        2,
        "0"
      )}.`
    );
  }

  const porDia =
    agruparPorDia(
      registros
    );

  console.log(
    `Registros diarios disponibles: ${registros.length}`
  );

  console.log(
    `Días con información: ${porDia.size}`
  );

  const workbook =
    await XlsxPopulate
      .fromFileAsync(
        TEMPLATE_PATH
      );

  const hojasOcultadas =
    ocultarHojasHeredadas(
      workbook
    );

  if (
    hojasOcultadas.length >
    0
  ) {
    console.log(
      `✓ Hojas heredadas ocultadas: ${hojasOcultadas.join(
        ", "
      )}`
    );
  }

  const refsInicialesLimpiadas =
    limpiarReferenciasRotasHeredadas(
      workbook
    );

  if (
    refsInicialesLimpiadas >
    0
  ) {
    console.log(
      `✓ Referencias heredadas rotas limpiadas: ${refsInicialesLimpiadas}`
    );
  }

  const totalDias =
    diasDelMes(
      anio,
      mes
    );

  let registrosEscritos =
    0;

  /* =====================================================
     1/5 DIARIO
  ===================================================== */

  console.log(
    "\n[1/6] Generando hojas diarias..."
  );

  for (
    let dia = 1;
    dia <= totalDias;
    dia++
  ) {
    const cantidad =
      llenarDia(
        workbook,
        dia,
        porDia.get(
          dia
        ) ?? []
      );

    registrosEscritos +=
      cantidad;

    console.log(
      `✓ Día ${String(
        dia
      ).padStart(
        2,
        "0"
      )}: ${cantidad} máquina(s)`
    );
  }

  for (
    let dia =
      totalDias + 1;
    dia <= 31;
    dia++
  ) {
    const sheet =
      workbook.sheet(
        String(
          dia
        ).padStart(
          2,
          "0"
        )
      );

    if (
      sheet
    ) {
      limpiarDatosDia(
        sheet
      );
    }
  }

  /* =====================================================
     2/5 SEMANAL
  ===================================================== */

  console.log(
    "\n[2/6] Generando hojas semanales..."
  );

  const semanas =
    generarHojasSemanales(
      workbook,
      registros,
      anio,
      mes
    );

  console.log(
    `✓ Semanas generadas: ${semanas.semanas}`
  );

  console.log(
    `✓ Hojas: ${semanas.nombres.join(
      ", "
    )}`
  );

  /* =====================================================
     3/5 MES
  ===================================================== */

  console.log(
    "\n[3/6] Generando hoja MES..."
  );

  generarHojaMes(
    workbook,
    registros,
    anio,
    mes
  );

  console.log(
    "✓ Hoja MES generada."
  );

  /* =====================================================
     4/5 %
  ===================================================== */

  console.log(
    "\n[4/6] Generando hoja %..."
  );

  const porcentajesEscritos =
    generarHojaPorcentaje(
      workbook,
      registros,
      anio,
      mes
    );

  console.log(
    `✓ Hoja % generada: ${porcentajesEscritos} valores.`
  );

  /* =====================================================
     5/5 RESUMEN
  ===================================================== */

  console.log(
    "\n[5/6] Generando hoja Resumen..."
  );

  const resumenResult =
    generarHojaResumen(
      workbook,
      registros,
      anio,
      mes
    );

  console.log(
    "✓ Hoja Resumen generada."
  );

  console.log(
    `✓ Máquinas con datos: ${resumenResult.maquinas}`
  );

  console.log(
    `✓ Secciones consolidadas: ${resumenResult.secciones}`
  );

  /* =====================================================
     6/6 ANUAL
  ===================================================== */

  console.log(
    "\n[6/6] Actualizando hoja Anual..."
  );

  const anualResult =
    generarHojaAnual(
      workbook,
      registros,
      anio,
      mes
    );

  console.log(
    "✓ Hoja Anual actualizada."
  );

  console.log(
    `✓ Filas existentes actualizadas: ${anualResult.actualizadas}`
  );

  console.log(
    `✓ Filas nuevas agregadas: ${anualResult.agregadas}`
  );

  console.log(
    `✓ Fila Meta: ${anualResult.metaRow}`
  );

  mostrarResumenMensual(
    registros
  );

  const perdidaImpresion =
    (
      calcularResumenSeccion(
        registros,
        "IMPRESION"
      )?.diferencia ??
      0
    ) *
    PERDIDA_FACTOR;

  const perdidaLaminacion =
    (
      calcularResumenSeccion(
        registros,
        "LAMINACION"
      )?.diferencia ??
      0
    ) *
    PERDIDA_FACTOR;

  console.log(
    "\nPérdida $ según regla histórica:"
  );

  console.log(
    `IMPRESION   | $${perdidaImpresion.toFixed(
      2
    )}`
  );

  console.log(
    `LAMINACION  | $${perdidaLaminacion.toFixed(
      2
    )}`
  );

  console.log(
    "BOLSERA     | Pérdida $ no aplicada (regla histórica no definida)"
  );

  /* =====================================================
     GUARDAR
  ===================================================== */

  fs.mkdirSync(
    OUTPUT_DIR,
    {
      recursive:
        true,
    }
  );

  const mesNumero =
    String(
      mes
    ).padStart(
      2,
      "0"
    );

  const nombreSalida =
    `PRUEBA - ${mesNumero} Cumplimiento ${MONTH_NAMES[mes]} ${anio}.xlsx`;

  const destino =
    path.join(
      OUTPUT_DIR,
      nombreSalida
    );

  const refsFinalesLimpiadas =
    limpiarReferenciasRotasHeredadas(
      workbook
    );

  if (
    refsFinalesLimpiadas >
    0
  ) {
    console.log(
      `✓ Referencias rotas eliminadas antes de guardar: ${refsFinalesLimpiadas}`
    );
  }

  await workbook
    .toFileAsync(
      destino
    );

  console.log(
    "\nValidando estructura OOXML..."
  );

  await repararMetadatosXlsx(
    destino
  );

  console.log(
    "✓ Metadatos OOXML reparados."
  );

  /* =====================================================
     RESULTADO
  ===================================================== */

  console.log(
    "\n" +
    "=".repeat(
      100
    )
  );

  console.log(
    "RESULTADO"
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    `Archivo:                 ${destino}`
  );

  console.log(
    `Días del mes:            ${totalDias}`
  );

  console.log(
    `Días con datos:          ${porDia.size}`
  );

  console.log(
    `Registros disponibles:   ${registros.length}`
  );

  console.log(
    `Registros diarios:       ${registrosEscritos}`
  );

  console.log(
    `Semanas generadas:       ${semanas.semanas}`
  );

  console.log(
    `Hojas semanales:         ${semanas.nombres.join(
      ", "
    )}`
  );

  console.log(
    "Hoja MES:                OK"
  );

  console.log(
    `Hoja %:                  ${porcentajesEscritos} valores`
  );

  console.log(
    `Hoja Resumen:            OK (${resumenResult.maquinas} máquinas)`
  );

  console.log(
    `Hoja Anual:              OK (${anualResult.actualizadas} actualizadas, ${anualResult.agregadas} agregadas)`
  );

  console.log(
    "=".repeat(
      100
    )
  );

  console.log(
    "\n✓ EXCEL V3.3.3 DIARIO + SEMANAL + MES + % + RESUMEN + ANUAL GENERADO"
  );

  console.log(
    "⚠ Pendiente funcional: Transferido. BOLSERA ya está integrada desde DRIVE_BOLSERA. Gráfica y 2025 VS 2026 quedan ligadas a Anual mediante pivots con refresco automático."
  );
}

/* =========================================================
   EJECUCIÓN
========================================================= */

main().catch(
  (
    error
  ) => {
    console.error(
      "\nERROR GENERANDO EXCEL"
    );

    console.error(
      error
    );

    process.exit(
      1
    );
  }
);
