export interface PeriodValidationInput {
  fechas: Array<string | null | undefined>;
  desde: string;
  hasta: string;
}

export interface PeriodValidationResult {
  valido: boolean;

  fechaMinima: string | null;
  fechaMaxima: string | null;

  totalFechas: number;
  fechasValidas: number;
  fechasInvalidas: number;

  fueraDeRango: string[];
  fechasNoValidas: string[];

  mensaje: string;
}

function normalizarFecha(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  const limpio =
    String(value).trim();

  /*
   * Formato esperado principal:
   * YYYY-MM-DD
   */
  const isoMatch =
    limpio.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (isoMatch) {
    const [, y, m, d] =
      isoMatch;

    const fecha =
      new Date(
        Number(y),
        Number(m) - 1,
        Number(d)
      );

    const valida =
      fecha.getFullYear() ===
        Number(y) &&
      fecha.getMonth() ===
        Number(m) - 1 &&
      fecha.getDate() ===
        Number(d);

    if (!valida) {
      return null;
    }

    return `${y}-${m}-${d}`;
  }

  /*
   * Compatibilidad DD/MM/YYYY
   */
  const slashMatch =
    limpio.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );

  if (slashMatch) {
    const [, dRaw, mRaw, y] =
      slashMatch;

    const d =
      dRaw.padStart(
        2,
        "0"
      );

    const m =
      mRaw.padStart(
        2,
        "0"
      );

    const fecha =
      new Date(
        Number(y),
        Number(m) - 1,
        Number(d)
      );

    const valida =
      fecha.getFullYear() ===
        Number(y) &&
      fecha.getMonth() ===
        Number(m) - 1 &&
      fecha.getDate() ===
        Number(d);

    if (!valida) {
      return null;
    }

    return `${y}-${m}-${d}`;
  }

  return null;
}

function validarLimite(
  value: string,
  nombre: string
): string {
  const fecha =
    normalizarFecha(
      value
    );

  if (!fecha) {
    throw new Error(
      `${nombre} no tiene formato de fecha válido: ${value}`
    );
  }

  return fecha;
}

export function validatePeriod(
  input: PeriodValidationInput
): PeriodValidationResult {
  const desde =
    validarLimite(
      input.desde,
      "Fecha desde"
    );

  const hasta =
    validarLimite(
      input.hasta,
      "Fecha hasta"
    );

  if (desde > hasta) {
    throw new Error(
      `El rango solicitado es inválido: ${desde} > ${hasta}`
    );
  }

  const fueraDeRango:
    string[] = [];

  const fechasNoValidas:
    string[] = [];

  const fechasNormalizadas:
    string[] = [];

  for (
    const raw of input.fechas
  ) {
    const fecha =
      normalizarFecha(
        raw
      );

    if (!fecha) {
      fechasNoValidas.push(
        String(
          raw ??
          ""
        )
      );

      continue;
    }

    fechasNormalizadas.push(
      fecha
    );

    if (
      fecha < desde ||
      fecha > hasta
    ) {
      fueraDeRango.push(
        fecha
      );
    }
  }

  const unicas =
    Array.from(
      new Set(
        fechasNormalizadas
      )
    ).sort();

  const fueraUnicas =
    Array.from(
      new Set(
        fueraDeRango
      )
    ).sort();

  const invalidasUnicas =
    Array.from(
      new Set(
        fechasNoValidas
      )
    );

  const fechaMinima =
    unicas.length > 0
      ? unicas[0]
      : null;

  const fechaMaxima =
    unicas.length > 0
      ? unicas[
          unicas.length - 1
        ]
      : null;

  let valido = true;
  let mensaje =
    "Periodo validado correctamente.";

  if (
    input.fechas.length ===
    0
  ) {
    valido = false;

    mensaje =
      "El archivo no contiene fechas para validar.";
  } else if (
    invalidasUnicas.length >
    0
  ) {
    valido = false;

    mensaje =
      `Se encontraron ${fechasNoValidas.length} fecha(s) inválida(s).`;
  } else if (
    fueraUnicas.length >
    0
  ) {
    valido = false;

    mensaje =
      `Se encontraron fechas fuera del rango solicitado ${desde} - ${hasta}: ${fueraUnicas.join(", ")}`;
  }

  return {
    valido,

    fechaMinima,
    fechaMaxima,

    totalFechas:
      input.fechas.length,

    fechasValidas:
      fechasNormalizadas.length,

    fechasInvalidas:
      fechasNoValidas.length,

    fueraDeRango:
      fueraUnicas,

    fechasNoValidas:
      invalidasUnicas,

    mensaje,
  };
}