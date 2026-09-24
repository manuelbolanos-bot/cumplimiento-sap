import fs from "node:fs";
import path from "node:path";

import XlsxPopulate from "xlsx-populate";

/* =========================================================
   RUTAS
========================================================= */

const origen =
  path.resolve(
    "data/templates/PLANTILLA - Cumplimiento Producción SAP.xlsx"
  );

const salidaDir =
  path.resolve(
    "data/templates"
  );

const destino =
  path.join(
    salidaDir,
    "PLANTILLA_MAESTRA_LIMPIA.xlsx"
  );

/* =========================================================
   MÁQUINAS DE LA PLANTILLA

   No dependen todavía del mapping SQLite.
   Aquí identificamos filas del formato Excel.
========================================================= */

const MAQUINAS = new Set([
  "429",
  "424",
  "420",
  "421",
  "410",
  "411",

  "439",
  "444",
  "447",
  "446",
  "430",

  "431",
  "465",

  "476",
  "478",
  "C.SPOUT",
  "C. SPOUT",
]);

/* =========================================================
   UTILIDADES
========================================================= */

function normalizar(
  valor: unknown
): string {
  return String(
    valor ?? ""
  )
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizarMaquina(
  valor: unknown
): string {
  let txt =
    normalizar(
      valor
    );

  /*
   * Excel puede devolver máquinas
   * numéricas como 429 o 429.0.
   */
  txt =
    txt.replace(
      /\.0$/,
      ""
    );

  return txt;
}

function esHojaDiaria(
  nombre: string
): boolean {
  return /^(0[1-9]|[12][0-9]|3[01])$/
    .test(
      nombre
    );
}

/* =========================================================
   LIMPIAR HOJA DIARIA

   IMPORTANTE:
   NO borramos fórmulas.

   Solo limpiamos campos que actualmente
   son entradas/manuales.

   C = Plan
   D = Real
   G = PROM LKW
   I = Comentarios

   E/F/H quedan intactas porque pueden
   contener fórmulas.
========================================================= */

function limpiarHojaDiaria(
  sheet: any
): number {
  let maquinasEncontradas =
    0;

  /*
   * El formato actual utiliza
   * aproximadamente hasta la fila 40.
   *
   * Usamos un margen mayor para no
   * depender demasiado de la plantilla.
   */
  for (
    let row = 1;
    row <= 60;
    row++
  ) {
    const maquina =
      normalizarMaquina(
        sheet
          .cell(
            `B${row}`
          )
          .value()
      );

    if (
      !MAQUINAS.has(
        maquina
      )
    ) {
      continue;
    }

    maquinasEncontradas++;

    /*
     * Valores que serán generados
     * automáticamente.
     */
    sheet
      .cell(
        `C${row}`
      )
      .value(
        undefined
      );

    sheet
      .cell(
        `D${row}`
      )
      .value(
        undefined
      );

    /*
     * PROM LKW queda temporalmente
     * fuera del proyecto.
     */
    sheet
      .cell(
        `G${row}`
      )
      .value(
        undefined
      );

    /*
     * Comentarios anteriores no deben
     * viajar al nuevo mes.
     */
    sheet
      .cell(
        `I${row}`
      )
      .value(
        undefined
      );

    /*
     * NO tocamos:
     *
     * E = Diferencia
     * F = Cumplimiento
     * H = Cumplimiento vs Prom
     *
     * porque algunas filas contienen
     * fórmulas que queremos preservar.
     */
  }

  return maquinasEncontradas;
}

/* =========================================================
   LIMPIAR BDD TÉCNICA

   Dejamos encabezados.
========================================================= */

function limpiarDesdeFila2(
  sheet: any
): void {
  const used =
    sheet.usedRange();

  if (
    !used
  ) {
    return;
  }

  const end =
    used.endCell();

  const lastRow =
    end.rowNumber();

  const lastColumn =
    end.columnNumber();

  if (
    lastRow <=
    1
  ) {
    return;
  }

  sheet
    .range(
      2,
      1,
      lastRow,
      lastColumn
    )
    .clear({
      contentsOnly:
        true,
    });
}

/* =========================================================
   HOJAS TÉCNICAS QUE DEBEN INICIAR VACÍAS
========================================================= */

function limpiarHojasTecnicas(
  workbook: any
): void {
  const hojas = [
    "SAP_RAW",
    "BDD_NORMALIZADA",
    "CONTROL_IMPORTACIONES",
    "RESUMEN_VALIDACION",
    "ALERTAS",
  ];

  for (
    const nombre
    of hojas
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

    limpiarDesdeFila2(
      sheet
    );

    console.log(
      `✓ Técnica limpiada: ${nombre}`
    );
  }
}

/* =========================================================
   ADVERTIR SOBRE HOJAS SEMANALES

   NO las eliminamos todavía.

   Posteriormente el generador creará
   S36, S37, S38...
========================================================= */

function identificarHojasSemanales(
  workbook: any
): string[] {
  return workbook
    .sheets()
    .map(
      (
        sheet: any
      ) =>
        sheet.name()
    )
    .filter(
      (
        nombre: string
      ) =>
        /^S\d{2}$/i.test(
          nombre
        )
    );
}

/* =========================================================
   MAIN
========================================================= */

async function main():
Promise<void> {
  console.log(
    "\n" +
    "=".repeat(
      90
    )
  );

  console.log(
    "PREPARANDO PLANTILLA MAESTRA"
  );

  console.log(
    "=".repeat(
      90
    )
  );

  if (
    !fs.existsSync(
      origen
    )
  ) {
    throw new Error(
      `No existe la plantilla:\n${origen}`
    );
  }

  fs.mkdirSync(
    salidaDir,
    {
      recursive:
        true,
    }
  );

  const workbook =
    await XlsxPopulate
      .fromFileAsync(
        origen
      );

  /* =====================================================
     1. LIMPIAR HOJAS DIARIAS
  ===================================================== */

  let hojasDiarias =
    0;

  let filasMaquinas =
    0;

  for (
    const sheet
    of workbook.sheets()
  ) {
    const nombre =
      sheet.name();

    if (
      !esHojaDiaria(
        nombre
      )
    ) {
      continue;
    }

    const encontradas =
      limpiarHojaDiaria(
        sheet
      );

    hojasDiarias++;

    filasMaquinas +=
      encontradas;

    console.log(
      `✓ ${nombre.padStart(
        2,
        "0"
      )}: ${encontradas} máquinas limpiadas`
    );
  }

  /* =====================================================
     2. LIMPIAR HOJAS TÉCNICAS
  ===================================================== */

  limpiarHojasTecnicas(
    workbook
  );

  /* =====================================================
     3. SEMANAS EXISTENTES

     Solo diagnóstico.
  ===================================================== */

  const semanas =
    identificarHojasSemanales(
      workbook
    );

  console.log(
    "\nHojas semanales antiguas detectadas:"
  );

  console.log(
    semanas.join(
      ", "
    ) ||
    "(ninguna)"
  );

  console.log(
    "\nIMPORTANTE:"
  );

  console.log(
    "Estas hojas no se reutilizarán directamente."
  );

  console.log(
    "El generador mensual construirá las semanas correspondientes al período solicitado."
  );

  /* =====================================================
     4. GUARDAR
  ===================================================== */

  await workbook
    .toFileAsync(
      destino
    );

  console.log(
    "\n" +
    "=".repeat(
      90
    )
  );

  console.log(
    "RESULTADO"
  );

  console.log(
    "=".repeat(
      90
    )
  );

  console.log(
    `Hojas diarias procesadas: ${hojasDiarias}`
  );

  console.log(
    `Filas máquina limpiadas:  ${filasMaquinas}`
  );

  console.log(
    `Salida: ${destino}`
  );

  console.log(
    "=".repeat(
      90
    )
  );

  console.log(
    "\n✓ PLANTILLA MAESTRA GENERADA"
  );
}

main().catch(
  (
    error
  ) => {
    console.error(
      "\nERROR PREPARANDO PLANTILLA"
    );

    console.error(
      error
    );

    process.exit(
      1
    );
  }
);