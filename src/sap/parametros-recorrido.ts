import dayjs from "dayjs";

import {
  Frame,
  Page,
} from "playwright";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../utils/logger.js";

export interface ParametrosRecorrido {
  desde?: string;
  hasta?: string;
}

/* =========================================================
   BUSCAR FRAME DEL FORMULARIO
========================================================= */

async function encontrarFrameFormulario(
  page: Page,
  timeout = 30_000
): Promise<Frame> {
  const limite =
    Date.now() + timeout;

  while (
    Date.now() < limite
  ) {
    for (
      const frame of page.frames()
    ) {
      try {
        const body =
          await frame
            .locator("body")
            .innerText()
            .catch(() => "");

        if (
          body.includes(
            "Sociedad"
          ) &&
          body.includes(
            "Fecha de Notificación"
          )
        ) {
          return frame;
        }
      } catch {
        // SAP puede reconstruir frames.
      }
    }

    await page.waitForTimeout(
      300
    );
  }

  throw new Error(
    "No se encontró el formulario Reporte de Recorrido"
  );
}

/* =========================================================
   VALIDAR FECHA ISO
========================================================= */

function validarFechaIso(
  fecha: string,
  nombre: string
): void {
  const patron =
    /^\d{4}-\d{2}-\d{2}$/;

  if (
    !patron.test(fecha)
  ) {
    throw new Error(
      `${nombre} debe usar formato YYYY-MM-DD. Recibido: ${fecha}`
    );
  }

  const fechaDayjs =
    dayjs(fecha);

  if (
    !fechaDayjs.isValid() ||
    fechaDayjs.format(
      "YYYY-MM-DD"
    ) !== fecha
  ) {
    throw new Error(
      `${nombre} no es una fecha válida: ${fecha}`
    );
  }
}

/* =========================================================
   CONVERTIR ISO → SAP
========================================================= */

function convertirFechaSap(
  fecha: string
): string {
  return dayjs(fecha).format(
    "DD.MM.YYYY"
  );
}

/* =========================================================
   COMPLETAR PARÁMETROS
========================================================= */

export async function completarParametrosRecorrido(
  page: Page,
  parametros: ParametrosRecorrido = {}
): Promise<void> {
  logger.info(
    "Completando parámetros de Reporte de Recorrido"
  );

  /*
   * Si no recibimos fechas por CLI,
   * mantenemos el comportamiento anterior:
   * consultar hoy.
   */
  const hoy =
    dayjs().format(
      "YYYY-MM-DD"
    );

  const desdeIso =
    parametros.desde ??
    hoy;

  const hastaIso =
    parametros.hasta ??
    desdeIso;

  validarFechaIso(
    desdeIso,
    "Fecha desde"
  );

  validarFechaIso(
    hastaIso,
    "Fecha hasta"
  );

  if (
    dayjs(desdeIso).isAfter(
      dayjs(hastaIso)
    )
  ) {
    throw new Error(
      `La fecha desde (${desdeIso}) no puede ser posterior a la fecha hasta (${hastaIso})`
    );
  }

  const fechaDesde =
    convertirFechaSap(
      desdeIso
    );

  const fechaHasta =
    convertirFechaSap(
      hastaIso
    );

  logger.info(
    {
      sociedad:
        env.SAP_SOCIEDAD,

      desdeIso,
      hastaIso,

      fechaDesde,
      fechaHasta,
    },
    "Parámetros que serán enviados a SAP"
  );

  const frame =
    await encontrarFrameFormulario(
      page
    );

  /* ======================================================
     SOCIEDAD
  ====================================================== */

  const sociedadInput =
    frame.locator(
      'input[title="Centro"]'
    )
      .first();

  await sociedadInput.waitFor({
    state: "visible",
    timeout: 30_000,
  });

  await sociedadInput.fill(
    env.SAP_SOCIEDAD
  );

  /* ======================================================
     FECHAS
  ====================================================== */

  const fechaInputs =
    frame.locator(
      'input[title="Fecha de creación del reporte."]'
    );

  const cantidadFechas =
    await fechaInputs.count();

  if (
    cantidadFechas < 2
  ) {
    throw new Error(
      `Se esperaban 2 campos de fecha y SAP devolvió ${cantidadFechas}`
    );
  }

  const fechaDesdeInput =
    fechaInputs.nth(0);

  const fechaHastaInput =
    fechaInputs.nth(1);

  await fechaDesdeInput.fill(
    fechaDesde
  );

  await fechaDesdeInput.press(
    "Tab"
  );

  await fechaHastaInput.fill(
    fechaHasta
  );

  await fechaHastaInput.press(
    "Tab"
  );

  logger.info(
    "Sociedad y período completados"
  );

  /* ======================================================
     VALIDACIÓN
  ====================================================== */

  const sociedadFinal =
    await sociedadInput.inputValue();

  const desdeFinal =
    await fechaDesdeInput.inputValue();

  const hastaFinal =
    await fechaHastaInput.inputValue();

  logger.info(
    {
      sociedad:
        sociedadFinal,

      fechaDesde:
        desdeFinal,

      fechaHasta:
        hastaFinal,
    },
    "Valores confirmados en formulario SAP"
  );

  if (
    sociedadFinal !==
    env.SAP_SOCIEDAD
  ) {
    throw new Error(
      `Sociedad incorrecta. Esperado=${env.SAP_SOCIEDAD}, Actual=${sociedadFinal}`
    );
  }

  if (
    desdeFinal !==
    fechaDesde
  ) {
    throw new Error(
      `Fecha desde incorrecta. Esperado=${fechaDesde}, Actual=${desdeFinal}`
    );
  }

  if (
    hastaFinal !==
    fechaHasta
  ) {
    throw new Error(
      `Fecha hasta incorrecta. Esperado=${fechaHasta}, Actual=${hastaFinal}`
    );
  }

  logger.info(
    "Parámetros de Recorrido validados correctamente"
  );
}