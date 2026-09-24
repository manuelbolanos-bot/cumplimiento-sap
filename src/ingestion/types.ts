export interface EventoProduccion {
  orden: string;
  operador: string;
  turno: number | null;

  codigoMaterial: string;
  pedido: string;
  posicion: number | null;

  nombreMaterial: string;

  fechaReporte: string;
  fechaReporteOriginal: string;

  puestoTrabajo: string;

  horas: number;

  cantidadOperacion: number;
  unidadOperacion: string;

  cantidadNotificada: number;
  unidadNotificada: string;

  cantidadMetros: number;
  unidadMetros: string;

  desperdicio: number;
  unidadDesperdicio: string;
}

export interface ArchivoStaging {
  metadata: {
    version: string;

    fuente: "SAP_S4HANA";

    transaccion: "ZPP10I";

    reporte: "RECORRIDO";

    sociedad: string;

    archivoOrigen: string;

    fechaProcesamiento: string;

    hojaOrigen: string;

    filaEncabezadosOrigen: number;

    columnasDetectadas: string[];

    totalRegistros: number;
  };

  registros: EventoProduccion[];
}

/*
 * Registro procesado.
 *
 * Conservamos el registro SAP original normalizado
 * y agregamos información propia del middleware.
 */
export interface EventoProduccionProcesado
  extends EventoProduccion {
  /*
   * Identificador determinístico.
   *
   * Si recibimos nuevamente exactamente
   * la misma fila SAP, tendrá el mismo ID.
   */
  eventId: string;

  /*
   * Fecha/hora en la cual nuestro sistema
   * procesó el registro.
   */
  procesadoEn: string;

  /*
   * Fuente que originó el dato.
   */
  fuente: "SAP_ZPP10I";

  /*
   * Sociedad SAP.
   */
  sociedad: string;
}

export interface RegistroRechazado {
  indice: number;

  motivo: string;

  registro: EventoProduccion;
}

export interface ArchivoProcessed {
  metadata: {
    version: string;

    fuente: "SAP_S4HANA";

    transaccion: "ZPP10I";

    reporte: "RECORRIDO";

    sociedad: string;

    archivoStaging: string;

    fechaProcesamiento: string;

    registrosEntrada: number;

    registrosValidos: number;

    registrosRechazados: number;

    duplicadosExactos: number;

    registrosFinales: number;
  };

  registros: EventoProduccionProcesado[];

  rechazados: RegistroRechazado[];
}