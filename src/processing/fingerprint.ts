import crypto from "node:crypto";

import {
  EventoProduccion,
} from "../ingestion/types.js";

/*
 * Generamos una representación estable
 * del registro.
 *
 * No utilizamos JSON.stringify(evento)
 * directamente porque queremos controlar
 * explícitamente el orden de los campos.
 */
function construirFirma(
  evento: EventoProduccion
): string {
  const valores = [
    evento.orden,
    evento.operador,
    evento.turno ?? "",

    evento.codigoMaterial,
    evento.pedido,
    evento.posicion ?? "",

    evento.nombreMaterial,

    evento.fechaReporte,

    evento.puestoTrabajo,

    evento.horas,

    evento.cantidadOperacion,
    evento.unidadOperacion,

    evento.cantidadNotificada,
    evento.unidadNotificada,

    evento.cantidadMetros,
    evento.unidadMetros,

    evento.desperdicio,
    evento.unidadDesperdicio,
  ];

  return valores.join(
    "|"
  );
}

export function generarEventId(
  evento: EventoProduccion
): string {
  const firma =
    construirFirma(
      evento
    );

  return crypto
    .createHash("sha256")
    .update(
      firma,
      "utf8"
    )
    .digest("hex");
}