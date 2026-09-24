/* =========================================================
   GENERADOR DE HOJAS SEMANALES
   Cumplimiento de Producción

   Estrategia:
   - reutilizar hojas Sxx existentes como plantillas visuales;
   - renombrarlas según las semanas realmente requeridas;
   - escribir datos directamente desde SQLite;
   - no depender de fórmulas históricas del Excel.
========================================================= */

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

/* =========================================================
   FILAS DE MÁQUINAS EN HOJA SEMANAL

   Cada máquina utiliza 4 filas:

   Plan
   Real
   Metros / Diferencia
   Cump
========================================================= */

interface WeeklyMachineConfig {
  planRow: number;
  realRow: number;
  diffRow: number;
  complianceRow: number;
  seccion: string;
}

const WEEKLY_MACHINE_ROWS:
Record<string, WeeklyMachineConfig> = {
  /* IMPRESION */

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

  /* LAMINACION */

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

  /* GRAFILADORA */

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

  /* BOLSERA */

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

/* =========================================================
   COLUMNAS DE LOS 7 DÍAS

   Usaremos siempre C:I.

   Esto evita depender de la posición histórica
   que tenía cada semana en la plantilla anterior.
========================================================= */

const WEEK_COLUMNS =
  [
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
  ];

/* =========================================================
   TOTAL SEMANAL

   Utilizamos AJ porque es la columna de total
   utilizada por varias hojas semanales originales.

   No usaremos las fórmulas antiguas.
========================================================= */

const TOTAL_COLUMN =
  "AJ";

/* =========================================================
   FECHAS
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
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
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

/* =========================================================
   LUNES DE UNA FECHA
========================================================= */

function getMonday(
  date: Date
): Date {
  const result =
    new Date(
      date
    );

  const day =
    result.getDay();

  const diff =
    (
      day + 6
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

/* =========================================================
   SEMANA ISO

   Necesitamos que:

   31/08/2026 → S36
   07/09/2026 → S37
   14/09/2026 → S38
========================================================= */

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

/* =========================================================
   ESTRUCTURA SEMANAL
========================================================= */

interface WeekGroup {
  sheetName: string;

  weekNumber: number;

  startDate: Date;
  endDate: Date;

  rows: DailyRow[];
}

/* =========================================================
   AGRUPAR DATOS POR SEMANA
========================================================= */

function groupByWeek(
  rows: DailyRow[]
): WeekGroup[] {
  const map =
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

    const monday =
      getMonday(
        fecha
      );

    const sunday =
      addDays(
        monday,
        6
      );

    const weekNumber =
      isoWeekNumber(
        monday
      );

    const sheetName =
      `S${String(
        weekNumber
      ).padStart(
        2,
        "0"
      )}`;

    if (
      !map.has(
        sheetName
      )
    ) {
      map.set(
        sheetName,
        {
          sheetName,

          weekNumber,

          startDate:
            monday,

          endDate:
            sunday,

          rows: [],
        }
      );
    }

    map
      .get(
        sheetName
      )!
      .rows
      .push(
        row
      );
  }

  return [
    ...map.values(),
  ].sort(
    (
      a,
      b
    ) =>
      a.startDate.getTime() -
      b.startDate.getTime()
  );
}

/* =========================================================
   MESES
========================================================= */

const MONTH_NAMES:
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
   LIMPIAR UNA HOJA SEMANAL

   IMPORTANTE:
   borramos valores/fórmulas antiguas del área operacional.
   Conservamos formatos, bordes, tamaños, colores, etc.
========================================================= */

function clearWeeklySheet(
  sheet: any
): void {
  /*
   * Fechas y matriz principal.
   */
  sheet
    .range(
      "C4:AJ60"
    )
    .clear({
      contentsOnly:
        true,
    });

  /*
   * Resumen lateral antiguo.
   * Lo limpiaremos y volveremos a escribir.
   */
  sheet
    .range(
      "AK6:AP30"
    )
    .clear({
      contentsOnly:
        true,
    });

  /*
   * Encabezado.
   */
  sheet
    .cell(
      "A1"
    )
    .value(
      undefined
    );
}

/* =========================================================
   ESCRIBIR ENCABEZADO
========================================================= */

function writeWeekHeader(
  sheet: any,
  week: WeekGroup
): void {
  const month =
    MONTH_NAMES[
      week.startDate.getMonth() +
      1
    ];

  const year =
    week.startDate.getFullYear();

  sheet
    .cell(
      "A1"
    )
    .value(
      `${month} ${year}`
    );

  /*
   * Fechas lunes-domingo en C4:I4.
   */
  WEEK_COLUMNS.forEach(
    (
      column,
      index
    ) => {
      const date =
        addDays(
          week.startDate,
          index
        );

      sheet
        .cell(
          `${column}4`
        )
        .value(
          date
        );

      sheet
        .cell(
          `${column}4`
        )
        .style(
          "numberFormat",
          "dd/mm"
        );
    }
  );

  sheet
    .cell(
      `${TOTAL_COLUMN}4`
    )
    .value(
      "Total"
    );
}

/* =========================================================
   BUSCAR REGISTRO
========================================================= */

function findRecord(
  rows: DailyRow[],
  date: Date,
  machine: string
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
      String(
        row.maquina
      ) ===
        machine
  );
}

/* =========================================================
   ESCRIBIR MATRIZ SEMANAL
========================================================= */

function writeWeeklyMatrix(
  sheet: any,
  week: WeekGroup
): void {
  for (
    const [
      machine,
      config,
    ]
    of Object.entries(
      WEEKLY_MACHINE_ROWS
    )
  ) {
    /*
     * La máquina queda visible en A.
     */
    sheet
      .cell(
        `A${config.planRow}`
      )
      .value(
        machine ===
          "C.SPOUT"
          ? "C.Spout"
          : Number(
              machine
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

    let hasData =
      false;

    WEEK_COLUMNS.forEach(
      (
        column,
        index
      ) => {
        const date =
          addDays(
            week.startDate,
            index
          );

        const record =
          findRecord(
            week.rows,
            date,
            machine
          );

        if (
          !record
        ) {
          return;
        }

        hasData =
          true;

        totalPlan +=
          Number(
            record.plan
          );

        totalReal +=
          Number(
            record.real
          );

        sheet
          .cell(
            `${column}${config.planRow}`
          )
          .value(
            record.plan
          );

        sheet
          .cell(
            `${column}${config.realRow}`
          )
          .value(
            record.real
          );

        sheet
          .cell(
            `${column}${config.diffRow}`
          )
          .value(
            record.diferencia
          );

        sheet
          .cell(
            `${column}${config.complianceRow}`
          )
          .value(
            record.cumplimiento
          );

        sheet
          .cell(
            `${column}${config.complianceRow}`
          )
          .style(
            "numberFormat",
            "0%"
          );
      }
    );

    if (
      !hasData
    ) {
      continue;
    }

    const totalDiff =
      totalReal -
      totalPlan;

    const totalCompliance =
      totalPlan !==
      0
        ? totalReal /
          totalPlan
        : 0;

    sheet
      .cell(
        `${TOTAL_COLUMN}${config.planRow}`
      )
      .value(
        totalPlan
      );

    sheet
      .cell(
        `${TOTAL_COLUMN}${config.realRow}`
      )
      .value(
        totalReal
      );

    sheet
      .cell(
        `${TOTAL_COLUMN}${config.diffRow}`
      )
      .value(
        totalDiff
      );

    sheet
      .cell(
        `${TOTAL_COLUMN}${config.complianceRow}`
      )
      .value(
        totalCompliance
      );

    sheet
      .cell(
        `${TOTAL_COLUMN}${config.complianceRow}`
      )
      .style(
        "numberFormat",
        "0%"
      );
  }
}

/* =========================================================
   RESUMEN POR SECCION
========================================================= */

interface SectionSummary {
  plan: number;
  real: number;
  diferencia: number;
  cumplimiento: number;
}

function calculateSectionSummary(
  rows: DailyRow[],
  section: string
): SectionSummary | null {
  const selected =
    rows.filter(
      (
        row
      ) =>
        row.seccion ===
        section
    );

  if (
    selected.length ===
    0
  ) {
    return null;
  }

  const plan =
    selected.reduce(
      (
        acc,
        row
      ) =>
        acc +
        Number(
          row.plan
        ),
      0
    );

  const real =
    selected.reduce(
      (
        acc,
        row
      ) =>
        acc +
        Number(
          row.real
        ),
      0
    );

  const diferencia =
    real -
    plan;

  return {
    plan,

    real,

    diferencia,

    cumplimiento:
      plan !==
      0
        ? real /
          plan
        : 0,
  };
}

/* =========================================================
   RESUMEN LATERAL

   Mantenemos la misma zona visual usada por
   las hojas semanales anteriores.
========================================================= */

function writeSideSummary(
  sheet: any,
  week: WeekGroup
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

  const impresion =
    calculateSectionSummary(
      week.rows,
      "IMPRESION"
    );

  const laminacion =
    calculateSectionSummary(
      week.rows,
      "LAMINACION"
    );

  const grafiladora =
    calculateSectionSummary(
      week.rows,
      "GRAFILADORA"
    );

  const summaries = [
    {
      label:
        "Impresión",
      row: 7,
      data:
        impresion,
    },

    {
      label:
        "Laminación",
      row: 8,
      data:
        laminacion,
    },

    {
      label:
        "Grafiladora",
      row: 9,
      data:
        grafiladora,
    },
  ];

  for (
    const summary
    of summaries
  ) {
    if (
      !summary.data
    ) {
      continue;
    }

    sheet
      .cell(
        `AK${summary.row}`
      )
      .value(
        summary.label
      );

    sheet
      .cell(
        `AL${summary.row}`
      )
      .value(
        summary.data.plan
      );

    sheet
      .cell(
        `AM${summary.row}`
      )
      .value(
        summary.data.real
      );

    sheet
      .cell(
        `AN${summary.row}`
      )
      .value(
        summary.data.diferencia
      );
  }

  if (
    impresion
  ) {
    sheet
      .cell(
        "AK11"
      )
      .value(
        "CUMPLIMIENTO IMPRESIÓN"
      );

    sheet
      .cell(
        "AL11"
      )
      .value(
        impresion.cumplimiento
      );

    sheet
      .cell(
        "AL11"
      )
      .style(
        "numberFormat",
        "0%"
      );
  }

  if (
    laminacion
  ) {
    sheet
      .cell(
        "AK12"
      )
      .value(
        "CUMPLIMIENTO LAMINACIÓN"
      );

    sheet
      .cell(
        "AL12"
      )
      .value(
        laminacion.cumplimiento
      );

    sheet
      .cell(
        "AL12"
      )
      .style(
        "numberFormat",
        "0%"
      );
  }

  if (
    grafiladora
  ) {
    sheet
      .cell(
        "AK13"
      )
      .value(
        "CUMPLIMIENTO GRAFILADORA"
      );

    sheet
      .cell(
        "AL13"
      )
      .value(
        grafiladora.cumplimiento
      );

    sheet
      .cell(
        "AL13"
      )
      .style(
        "numberFormat",
        "0%"
      );
  }
}

/* =========================================================
   HOJAS SEMANALES DISPONIBLES EN LA PLANTILLA
========================================================= */

function findExistingWeeklySheets(
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

/* =========================================================
   GENERAR SEMANAS

   Por ahora reutilizamos hojas semanales existentes.
   De esta forma NO duplicamos drawings/objetos de Excel.
========================================================= */

export function fillWeeklySheets(
  workbook: any,
  rows: DailyRow[]
): {
  weeks: number;
  names: string[];
} {
  const weeks =
    groupByWeek(
      rows
    );

  const templates =
    findExistingWeeklySheets(
      workbook
    );

  if (
    templates.length <
    weeks.length
  ) {
    throw new Error(
      [
        "No hay suficientes hojas semanales disponibles",
        "en la plantilla para el período actual.",
        "",
        `Necesarias: ${weeks.length}`,
        `Disponibles: ${templates.length}`,
        "",
        "Por seguridad todavía no clonaremos hojas",
        "con objetos gráficos de Excel.",
      ].join(
        "\n"
      )
    );
  }

  /*
   * Guardamos primero nombres temporales,
   * evitando colisiones como:
   *
   * S26 → S36
   * cuando S36 eventualmente ya exista.
   */
  templates.forEach(
    (
      sheet: any,
      index: number
    ) => {
      sheet.name(
        `TMP_WEEK_${index + 1}`
      );
    }
  );

  const generatedNames:
    string[] = [];

  /*
   * Reutilizar únicamente las hojas necesarias.
   */
  weeks.forEach(
    (
      week,
      index
    ) => {
      const sheet =
        templates[
          index
        ];

      sheet.name(
        week.sheetName
      );

      clearWeeklySheet(
        sheet
      );

      writeWeekHeader(
        sheet,
        week
      );

      writeWeeklyMatrix(
        sheet,
        week
      );

      writeSideSummary(
        sheet,
        week
      );

      generatedNames.push(
        week.sheetName
      );
    }
  );

  /*
   * Las hojas semanales sobrantes NO deben
   * conservar información del período anterior.
   *
   * Las dejamos ocultas conceptualmente mediante
   * nombre técnico temporal por ahora.
   *
   * En una fase posterior podremos eliminarlas.
   */
  for (
    let index =
      weeks.length;
    index <
      templates.length;
    index++
  ) {
    const sheet =
      templates[
        index
      ];

    clearWeeklySheet(
      sheet
    );

    sheet.name(
      `SEMANA_NO_USADA_${index + 1}`
    );
  }

  return {
    weeks:
      weeks.length,

    names:
      generatedNames,
  };
}