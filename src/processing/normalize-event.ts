import {
  EventoProduccion,
} from "../ingestion/types.js";

/*
 * No modificamos cantidades ni códigos.
 *
 * Aquí solamente normalizamos campos de texto
 * donde diferencias de mayúsculas/minúsculas
 * no deberían crear registros diferentes.
 */
export function normalizarEventoProduccion(
  evento: EventoProduccion
): EventoProduccion {
  return {
    ...evento,

    /*
     * "Alexander"
     * "ALEXANDER"
     * " alexander "
     *
     * se consideran el mismo operador textual.
     */
    operador:
      evento.operador
        .trim()
        .toUpperCase(),

    /*
     * Puestos SAP también los normalizamos.
     */
    puestoTrabajo:
      evento.puestoTrabajo
        .trim()
        .toUpperCase(),

    /*
     * Unidades.
     */
    unidadOperacion:
      evento.unidadOperacion
        .trim()
        .toUpperCase(),

    unidadNotificada:
      evento.unidadNotificada
        .trim()
        .toUpperCase(),

    unidadMetros:
      evento.unidadMetros
        .trim()
        .toUpperCase(),

    unidadDesperdicio:
      evento.unidadDesperdicio
        .trim()
        .toUpperCase(),
  };
}