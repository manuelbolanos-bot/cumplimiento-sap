import {
  EventoProduccion,
} from "../ingestion/types.js";

export interface ResultadoValidacion {
  valido: boolean;

  errores: string[];
}

export function validarEventoProduccion(
  evento: EventoProduccion
): ResultadoValidacion {
  const errores: string[] = [];

  /*
   * ORDEN
   */
  if (!evento.orden) {
    errores.push(
      "Orden vacía"
    );
  }

  /*
   * CÓDIGO MATERIAL
   */
  if (!evento.codigoMaterial) {
    errores.push(
      "Código de material vacío"
    );
  }

  /*
   * FECHA
   */
  if (!evento.fechaReporte) {
    errores.push(
      "Fecha de reporte vacía"
    );
  } else {
    const formatoIso =
      /^\d{4}-\d{2}-\d{2}$/;

    if (
      !formatoIso.test(
        evento.fechaReporte
      )
    ) {
      errores.push(
        `Fecha de reporte inválida: ${evento.fechaReporte}`
      );
    }
  }

  /*
   * PUESTO
   */
  if (!evento.puestoTrabajo) {
    errores.push(
      "Puesto de trabajo vacío"
    );
  }

  /*
   * CANTIDADES
   *
   * Permitimos cero.
   * No permitimos NaN ni infinitos.
   */
  const cantidades = [
    {
      nombre:
        "horas",

      valor:
        evento.horas,
    },
    {
      nombre:
        "cantidadOperacion",

      valor:
        evento.cantidadOperacion,
    },
    {
      nombre:
        "cantidadNotificada",

      valor:
        evento.cantidadNotificada,
    },
    {
      nombre:
        "cantidadMetros",

      valor:
        evento.cantidadMetros,
    },
    {
      nombre:
        "desperdicio",

      valor:
        evento.desperdicio,
    },
  ];

  for (
    const cantidad
    of cantidades
  ) {
    if (
      !Number.isFinite(
        cantidad.valor
      )
    ) {
      errores.push(
        `${cantidad.nombre} no es un número válido`
      );
    }
  }

  return {
    valido:
      errores.length === 0,

    errores,
  };
}