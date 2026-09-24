import { db } from "./db.js";
import { logger } from "../utils/logger.js";

/* =========================================================
   TIPOS
========================================================= */

interface OperacionRevision {
  operation_id: string;

  puesto_sap: string;
  maquina: string;
  proceso: string;

  orden: string;
  posicion: number | null;

  codigo_material: string;
  nombre_material: string;

  fecha_desde: string;
  fecha_hasta: string;

  eventos: number;

  plan: number;
  real: number | null;

  diferencia: number | null;
  cumplimiento: number | null;

  horas: number;
  desperdicio: number;

  estado_validacion: string;
  notas: string;
}

interface EventoSap {
  event_id: string;

  fecha_reporte: string;

  orden: string;
  posicion: number | null;

  codigo_material: string;
  nombre_material: string;

  operador: string;
  turno: number | null;

  cantidad_operacion: number;
  unidad_operacion: string;

  cantidad_notificada: number;
  unidad_notificada: string;

  cantidad_metros: number;
  unidad_metros: string;

  desperdicio: number;
  unidad_desperdicio: string;

  horas: number;
}

interface ResumenEventos {
  total_eventos: number;

  cantidad_operacion_min: number;
  cantidad_operacion_max: number;

  cantidad_metros_total: number;
  cantidad_notificada_total: number;

  horas_total: number;
  desperdicio_total: number;

  metros_distintos: number;
  operacion_distinta: number;

  dias_distintos: number;
  operadores_distintos: number;
  turnos_distintos: number;
}

/* =========================================================
   UTILIDADES
========================================================= */

function numero(
  valor: number | null | undefined,
  decimals = 3
): string {
  if (
    valor === null ||
    valor === undefined
  ) {
    return "-";
  }

  return Number(valor)
    .toLocaleString(
      "en-US",
      {
        maximumFractionDigits:
          decimals,
      }
    );
}

function porcentaje(
  valor: number | null | undefined
): string {
  if (
    valor === null ||
    valor === undefined ||
    !Number.isFinite(valor)
  ) {
    return "-";
  }

  return `${Number(valor).toFixed(2)}%`;
}

/* =========================================================
   OBTENER OPERACIONES EN REVISIÓN

   Excluimos PENDIENTE_REGLA porque corresponde
   a puestos donde todavía no existe fórmula definida.
========================================================= */

function obtenerOperacionesRevision():
OperacionRevision[] {
  const sql = `
    SELECT
      operation_id,

      puesto_sap,
      maquina,
      proceso,

      orden,
      posicion,

      codigo_material,
      nombre_material,

      fecha_desde,
      fecha_hasta,

      eventos,

      plan,
      real,

      diferencia,
      cumplimiento,

      horas,
      desperdicio,

      estado_validacion,
      notas

    FROM
      compliance_operations_candidate

    WHERE
      requiere_revision = 1

      AND estado_validacion <> 'PENDIENTE_REGLA'

    ORDER BY
      CASE estado_validacion

        WHEN 'EXCLUIR_PRUEBA'
        THEN 1

        WHEN 'REVISAR_SIN_PLAN'
        THEN 2

        WHEN 'REVISAR_SIN_REAL'
        THEN 3

        WHEN 'REVISAR_CUMP_ALTO'
        THEN 4

        WHEN 'REVISAR_CUMP_BAJO'
        THEN 5

        ELSE 99

      END,

      proceso,
      maquina,
      orden
  `;

  return db
    .prepare(sql)
    .all() as OperacionRevision[];
}

/* =========================================================
   OBTENER EVENTOS ORIGINALES
========================================================= */

function obtenerEventos(
  operacion: OperacionRevision
): EventoSap[] {
  const sql = `
    SELECT
      event_id,

      fecha_reporte,

      orden,
      posicion,

      codigo_material,
      nombre_material,

      operador,
      turno,

      cantidad_operacion,
      unidad_operacion,

      cantidad_notificada,
      unidad_notificada,

      cantidad_metros,
      unidad_metros,

      desperdicio,
      unidad_desperdicio,

      horas

    FROM
      events

    WHERE
      puesto_trabajo = ?

      AND orden = ?

      AND COALESCE(
        posicion,
        -999999
      ) =
      COALESCE(
        ?,
        -999999
      )

      AND codigo_material = ?

    ORDER BY
      fecha_reporte,
      turno,
      operador,
      event_id
  `;

  return db
    .prepare(sql)
    .all(
      operacion.puesto_sap,
      operacion.orden,
      operacion.posicion,
      operacion.codigo_material
    ) as EventoSap[];
}

/* =========================================================
   RESUMEN EVENTOS
========================================================= */

function resumirEventos(
  eventos: EventoSap[]
): ResumenEventos {
  if (
    eventos.length === 0
  ) {
    return {
      total_eventos: 0,

      cantidad_operacion_min: 0,
      cantidad_operacion_max: 0,

      cantidad_metros_total: 0,
      cantidad_notificada_total: 0,

      horas_total: 0,
      desperdicio_total: 0,

      metros_distintos: 0,
      operacion_distinta: 0,

      dias_distintos: 0,
      operadores_distintos: 0,
      turnos_distintos: 0,
    };
  }

  const operaciones =
    eventos.map(
      (e) =>
        Number(
          e.cantidad_operacion ??
            0
        )
    );

  const metros =
    eventos.map(
      (e) =>
        Number(
          e.cantidad_metros ??
            0
        )
    );

  const notificada =
    eventos.map(
      (e) =>
        Number(
          e.cantidad_notificada ??
            0
        )
    );

  const horas =
    eventos.map(
      (e) =>
        Number(
          e.horas ??
            0
        )
    );

  const desperdicio =
    eventos.map(
      (e) =>
        Number(
          e.desperdicio ??
            0
        )
    );

  const valoresOperacion =
    new Set(
      operaciones.map(
        (value) =>
          value.toString()
      )
    );

  const valoresMetros =
    new Set(
      metros.map(
        (value) =>
          value.toString()
      )
    );

  const dias =
    new Set(
      eventos.map(
        (e) =>
          e.fecha_reporte
      )
    );

  const operadores =
    new Set(
      eventos
        .map(
          (e) =>
            String(
              e.operador ??
                ""
            ).trim()
        )
        .filter(
          Boolean
        )
    );

  const turnos =
    new Set(
      eventos
        .map(
          (e) =>
            e.turno
        )
        .filter(
          (
            value
          ) =>
            value !== null &&
            value !== undefined
        )
        .map(
          String
        )
    );

  return {
    total_eventos:
      eventos.length,

    cantidad_operacion_min:
      Math.min(
        ...operaciones
      ),

    cantidad_operacion_max:
      Math.max(
        ...operaciones
      ),

    cantidad_metros_total:
      metros.reduce(
        (
          total,
          value
        ) =>
          total +
          value,
        0
      ),

    cantidad_notificada_total:
      notificada.reduce(
        (
          total,
          value
        ) =>
          total +
          value,
        0
      ),

    horas_total:
      horas.reduce(
        (
          total,
          value
        ) =>
          total +
          value,
        0
      ),

    desperdicio_total:
      desperdicio.reduce(
        (
          total,
          value
        ) =>
          total +
          value,
        0
      ),

    metros_distintos:
      valoresMetros.size,

    operacion_distinta:
      valoresOperacion.size,

    dias_distintos:
      dias.size,

    operadores_distintos:
      operadores.size,

    turnos_distintos:
      turnos.size,
  };
}

/* =========================================================
   DETECCIÓN DE POSIBLES REPETICIONES
========================================================= */

function detectarRepeticiones(
  eventos: EventoSap[]
): {
  metrosRepetidos:
    Array<{
      valor: number;
      repeticiones: number;
    }>;

  operacionRepetida:
    Array<{
      valor: number;
      repeticiones: number;
    }>;
} {
  const contadorMetros =
    new Map<
      number,
      number
    >();

  const contadorOperacion =
    new Map<
      number,
      number
    >();

  for (
    const evento of eventos
  ) {
    const metros =
      Number(
        evento.cantidad_metros ??
          0
      );

    const operacion =
      Number(
        evento.cantidad_operacion ??
          0
      );

    contadorMetros.set(
      metros,
      (
        contadorMetros.get(
          metros
        ) ??
        0
      ) +
        1
    );

    contadorOperacion.set(
      operacion,
      (
        contadorOperacion.get(
          operacion
        ) ??
        0
      ) +
        1
    );
  }

  const metrosRepetidos =
    Array.from(
      contadorMetros.entries()
    )
      .filter(
        (
          [
            valor,
            repeticiones,
          ]
        ) =>
          valor !== 0 &&
          repeticiones > 1
      )
      .map(
        (
          [
            valor,
            repeticiones,
          ]
        ) => ({
          valor,
          repeticiones,
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          b.repeticiones -
          a.repeticiones
      );

  const operacionRepetida =
    Array.from(
      contadorOperacion.entries()
    )
      .filter(
        (
          [
            ,
            repeticiones,
          ]
        ) =>
          repeticiones > 1
      )
      .map(
        (
          [
            valor,
            repeticiones,
          ]
        ) => ({
          valor,
          repeticiones,
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          b.repeticiones -
          a.repeticiones
      );

  return {
    metrosRepetidos,
    operacionRepetida,
  };
}

/* =========================================================
   MOSTRAR EVENTOS
========================================================= */

function mostrarEventos(
  eventos: EventoSap[]
): void {
  console.log(
    "\nEVENTOS SAP"
  );

  console.log(
    "-".repeat(
      155
    )
  );

  console.log(
    [
      "FECHA".padEnd(
        12
      ),
      "OPERADOR".padEnd(
        14
      ),
      "TURNO".padStart(
        5
      ),
      "OPERACION".padStart(
        16
      ),
      "U.OP".padEnd(
        5
      ),
      "NOTIFICADA".padStart(
        14
      ),
      "U.NOT".padEnd(
        6
      ),
      "METROS".padStart(
        14
      ),
      "HORAS".padStart(
        10
      ),
      "DESP".padStart(
        12
      ),
    ].join(
      " | "
    )
  );

  console.log(
    "-".repeat(
      155
    )
  );

  for (
    const evento of eventos
  ) {
    console.log(
      [
        String(
          evento.fecha_reporte ??
            ""
        )
          .padEnd(
            12
          ),

        String(
          evento.operador ??
            "-"
        )
          .padEnd(
            14
          ),

        String(
          evento.turno ??
            "-"
        )
          .padStart(
            5
          ),

        numero(
          evento.cantidad_operacion
        )
          .padStart(
            16
          ),

        String(
          evento.unidad_operacion ??
            "-"
        )
          .padEnd(
            5
          ),

        numero(
          evento.cantidad_notificada
        )
          .padStart(
            14
          ),

        String(
          evento.unidad_notificada ??
            "-"
        )
          .padEnd(
            6
          ),

        numero(
          evento.cantidad_metros
        )
          .padStart(
            14
          ),

        numero(
          evento.horas,
          2
        )
          .padStart(
            10
          ),

        numero(
          evento.desperdicio
        )
          .padStart(
            12
          ),
      ].join(
        " | "
      )
    );
  }

  console.log(
    "-".repeat(
      155
    )
  );
}

/* =========================================================
   MOSTRAR REPETICIONES
========================================================= */

function mostrarRepeticiones(
  eventos: EventoSap[]
): void {
  const {
    metrosRepetidos,
    operacionRepetida,
  } =
    detectarRepeticiones(
      eventos
    );

  console.log(
    "\nPATRONES REPETIDOS"
  );

  if (
    operacionRepetida.length >
    0
  ) {
    console.log(
      "Cantidad operacion repetida:"
    );

    for (
      const item of operacionRepetida
    ) {
      console.log(
        `  ${numero(
          item.valor
        )} -> ${item.repeticiones} veces`
      );
    }
  } else {
    console.log(
      "Cantidad operacion repetida: NO"
    );
  }

  if (
    metrosRepetidos.length >
    0
  ) {
    console.log(
      "Cantidad metros repetida:"
    );

    for (
      const item of metrosRepetidos
    ) {
      console.log(
        `  ${numero(
          item.valor
        )} -> ${item.repeticiones} veces`
      );
    }
  } else {
    console.log(
      "Cantidad metros repetida: NO"
    );
  }
}

/* =========================================================
   MOSTRAR OPERACIÓN
========================================================= */

function mostrarOperacion(
  operacion: OperacionRevision
): void {
  const eventos =
    obtenerEventos(
      operacion
    );

  const resumen =
    resumirEventos(
      eventos
    );

  console.log(
    "\n" +
    "=".repeat(
      155
    )
  );

  console.log(
    `${operacion.proceso} | MAQUINA ${operacion.maquina} | PUESTO ${operacion.puesto_sap}`
  );

  console.log(
    "=".repeat(
      155
    )
  );

  console.log(
    `Estado:       ${operacion.estado_validacion}`
  );

  console.log(
    `Orden:        ${operacion.orden}`
  );

  console.log(
    `Posicion:     ${operacion.posicion ?? ""}`
  );

  console.log(
    `Material:     ${operacion.codigo_material} - ${operacion.nombre_material}`
  );

  console.log(
    `Periodo:      ${operacion.fecha_desde} -> ${operacion.fecha_hasta}`
  );

  console.log(
    `Eventos:      ${operacion.eventos}`
  );

  console.log(
    ""
  );

  console.log(
    `Plan candidato:       ${numero(
      operacion.plan
    )} M`
  );

  console.log(
    `Real candidato:       ${
      operacion.real ===
      null
        ? "-"
        : `${numero(
            operacion.real
          )} M`
    }`
  );

  console.log(
    `Diferencia:           ${
      operacion.diferencia ===
      null
        ? "-"
        : `${numero(
            operacion.diferencia
          )} M`
    }`
  );

  console.log(
    `Cumplimiento:         ${porcentaje(
      operacion.cumplimiento
    )}`
  );

  console.log(
    ""
  );

  console.log(
    `Horas acumuladas:     ${numero(
      operacion.horas,
      2
    )}`
  );

  console.log(
    `Desperdicio total:    ${numero(
      operacion.desperdicio
    )}`
  );

  console.log(
    `Motivo revision:      ${operacion.notas || "-"}`
  );

  console.log(
    "\nRESUMEN DEL EVENTO ORIGINAL"
  );

  console.log(
    `Eventos encontrados:             ${resumen.total_eventos}`
  );

  console.log(
    `Cantidad operacion minima:       ${numero(
      resumen.cantidad_operacion_min
    )}`
  );

  console.log(
    `Cantidad operacion maxima:       ${numero(
      resumen.cantidad_operacion_max
    )}`
  );

  console.log(
    `Valores distintos de operacion:  ${resumen.operacion_distinta}`
  );

  console.log(
    `Suma cantidad metros:            ${numero(
      resumen.cantidad_metros_total
    )}`
  );

  console.log(
    `Valores distintos de metros:     ${resumen.metros_distintos}`
  );

  console.log(
    `Suma cantidad notificada:        ${numero(
      resumen.cantidad_notificada_total
    )}`
  );

  console.log(
    `Suma horas:                      ${numero(
      resumen.horas_total,
      2
    )}`
  );

  console.log(
    `Suma desperdicio:                ${numero(
      resumen.desperdicio_total
    )}`
  );

  console.log(
    `Dias distintos:                  ${resumen.dias_distintos}`
  );

  console.log(
    `Operadores distintos:            ${resumen.operadores_distintos}`
  );

  console.log(
    `Turnos distintos:                ${resumen.turnos_distintos}`
  );

  mostrarEventos(
    eventos
  );

  mostrarRepeticiones(
    eventos
  );
}

/* =========================================================
   RESUMEN GENERAL
========================================================= */

function mostrarResumenGeneral(
  operaciones:
    OperacionRevision[]
): void {
  interface ResumenEstado {
    estado_validacion: string;
    total: number;
  }

  const estados =
    new Map<
      string,
      number
    >();

  for (
    const operacion of operaciones
  ) {
    estados.set(
      operacion.estado_validacion,
      (
        estados.get(
          operacion.estado_validacion
        ) ??
        0
      ) +
        1
    );
  }

  const resumen:
    ResumenEstado[] =
    Array.from(
      estados.entries()
    )
      .map(
        (
          [
            estado_validacion,
            total,
          ]
        ) => ({
          estado_validacion,
          total,
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          b.total -
          a.total
      );

  console.log(
    "\n" +
    "#".repeat(
      80
    )
  );

  console.log(
    "RESUMEN AUDITORIA"
  );

  console.log(
    "#".repeat(
      80
    )
  );

  console.log(
    `Operaciones auditadas: ${operaciones.length}`
  );

  console.log(
    ""
  );

  for (
    const row of resumen
  ) {
    console.log(
      `${row.estado_validacion.padEnd(
        28
      )} ${String(
        row.total
      ).padStart(
        5
      )}`
    );
  }

  console.log(
    "#".repeat(
      80
    )
  );
}

/* =========================================================
   MAIN
========================================================= */

function main():
void {
  logger.info(
    "=================================="
  );

  logger.info(
    "AUDITORIA OPERACIONES CUMPLIMIENTO"
  );

  logger.info(
    "=================================="
  );

  const operaciones =
    obtenerOperacionesRevision();

  if (
    operaciones.length ===
    0
  ) {
    logger.info(
      "No existen operaciones con regla definida pendientes de revision"
    );

    return;
  }

  mostrarResumenGeneral(
    operaciones
  );

  for (
    const operacion of operaciones
  ) {
    mostrarOperacion(
      operacion
    );
  }

  logger.info(
    {
      operacionesAuditadas:
        operaciones.length,
    },
    "Auditoria completada"
  );

  logger.info(
    "=================================="
  );

  logger.info(
    "FIN AUDITORIA"
  );

  logger.info(
    "=================================="
  );
}

main();