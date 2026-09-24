/*
 * Convierte cualquier valor recibido desde Excel
 * en texto limpio.
 */
export function toText(
  value: unknown
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

/*
 * Convierte números provenientes de Excel.
 *
 * Ejemplos:
 *
 * 2380
 * "2380"
 * "2,380.000"
 *
 * → 2380
 */
export function toNumber(
  value: unknown
): number {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  const texto = String(value)
    .trim()
    .replace(/,/g, "");

  const numero = Number(texto);

  if (Number.isNaN(numero)) {
    return 0;
  }

  return numero;
}

/*
 * Igual que toNumber, pero permite null.
 */
export function toNullableNumber(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const texto = String(value)
    .trim()
    .replace(/,/g, "");

  const numero = Number(texto);

  if (Number.isNaN(numero)) {
    return null;
  }

  return numero;
}

/*
 * Normaliza el número de pedido SAP.
 *
 * SAP maneja pedidos con longitud de 10 dígitos.
 *
 * Excel puede convertir:
 *
 * 0103043178
 *
 * en:
 *
 * 103043178
 *
 * Recuperamos el cero inicial.
 */
export function toSapPedido(
  value: unknown
): string {
  const texto = toText(value);

  if (!texto) {
    return "";
  }

  /*
   * Si es puramente numérico,
   * completamos hasta 10 posiciones.
   */
  if (/^\d+$/.test(texto)) {
    return texto.padStart(
      10,
      "0"
    );
  }

  /*
   * Si por alguna razón SAP utiliza
   * caracteres no numéricos, no alteramos
   * el valor.
   */
  return texto;
}

/*
 * Convierte fechas provenientes del XLSX SAP
 * al formato ISO:
 *
 * YYYY-MM-DD
 *
 * El archivo puede llegar en varios formatos
 * dependiendo de cómo Excel interprete la celda:
 *
 * 16.09.2026
 * 9/16/26
 * 09/16/2026
 * 2026-09-16
 */
export function sapDateToIso(
  value: unknown
): string {
  const texto = toText(value);

  if (!texto) {
    return "";
  }

  /*
   * Caso 1
   *
   * DD.MM.YYYY
   */
  let match = texto.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
  );

  if (match) {
    const [, dia, mes, anio] =
      match;

    return `${anio}-${mes.padStart(
      2,
      "0"
    )}-${dia.padStart(
      2,
      "0"
    )}`;
  }

  /*
   * Caso 2
   *
   * M/D/YY
   * MM/DD/YY
   * M/D/YYYY
   * MM/DD/YYYY
   *
   * El XLSX exportado actualmente
   * nos está devolviendo 9/16/26.
   */
  match = texto.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/
  );

  if (match) {
    const [
      ,
      mes,
      dia,
      anioOriginal,
    ] = match;

    let anio =
      anioOriginal;

    if (anio.length === 2) {
      /*
       * Para este proyecto estamos trabajando
       * con producción contemporánea.
       *
       * 26 → 2026
       */
      anio =
        `20${anio}`;
    }

    return `${anio}-${mes.padStart(
      2,
      "0"
    )}-${dia.padStart(
      2,
      "0"
    )}`;
  }

  /*
   * Caso 3
   *
   * Ya viene ISO.
   */
  match = texto.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (match) {
    return texto;
  }

  /*
   * Si SAP cambia el formato,
   * conservamos el original para no
   * destruir información.
   */
  return texto;
}