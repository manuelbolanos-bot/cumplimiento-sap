import { db } from "./db.js";
import { logger } from "../utils/logger.js";

interface MappingProduccion {
  puestoSap: string;
  maquina: string;

  proceso:
    | "IMPRESION"
    | "LAMINACION"
    | "GRAFILADORA"
    | "BOLSERA";

  campoPlan: string;
  campoReal: string;

  unidad: string;

  activo: number;

  notas: string;
}

/*
 * CONFIGURACION PRODUCTIVA V1
 *
 * REGLA:
 *
 * activo = 1
 *   Participa en SAP_PRINCIPAL.
 *
 * activo = 0
 *   Se reconoce el puesto, pero no participa
 *   en cumplimiento.
 *
 * IMPORTANTE:
 *
 * Bolsera queda conocida en machine_mapping,
 * pero activo = 0.
 *
 * campoPlan/campoReal se mantienen con valores
 * técnicos porque el esquema actual de SQLite
 * tiene esas columnas como NOT NULL.
 *
 * Eso NO significa que Bolsera use esos campos
 * para cumplimiento.
 */

const mappings: MappingProduccion[] = [
  // ======================================================
  // IMPRESION
  // ======================================================

  {
    puestoSap: "410P",
    maquina: "410",
    proceso: "IMPRESION",

    campoPlan:
      "cantidad_operacion",

    campoReal:
      "cantidad_metros",

    unidad: "M",

    activo: 1,

    notas:
      "Incluido en SAP principal. Logica historica: suma fila por fila.",
  },

  {
    puestoSap: "424P",
    maquina: "424",
    proceso: "IMPRESION",

    campoPlan:
      "cantidad_operacion",

    campoReal:
      "cantidad_metros",

    unidad: "M",

    activo: 1,

    notas:
      "Incluido en SAP principal. Logica historica: suma fila por fila.",
  },

  {
    puestoSap: "429P",
    maquina: "429",
    proceso: "IMPRESION",

    campoPlan:
      "cantidad_operacion",

    campoReal:
      "cantidad_metros",

    unidad: "M",

    activo: 1,

    notas:
      "Incluido en SAP principal. Logica historica: suma fila por fila.",
  },

  // ======================================================
  // LAMINACION
  // ======================================================

  {
    puestoSap: "430P",
    maquina: "430",
    proceso: "LAMINACION",

    campoPlan:
      "cantidad_operacion",

    campoReal:
      "cantidad_metros",

    unidad: "M",

    activo: 1,

    notas:
      "Incluido en SAP principal. Logica historica: suma fila por fila.",
  },

  {
    puestoSap: "444P",
    maquina: "444",
    proceso: "LAMINACION",

    campoPlan:
      "cantidad_operacion",

    campoReal:
      "cantidad_metros",

    unidad: "M",

    activo: 1,

    notas:
      "Incluido en SAP principal. Logica historica: suma fila por fila.",
  },

  {
    puestoSap: "446P",
    maquina: "446",
    proceso: "LAMINACION",

    campoPlan:
      "cantidad_operacion",

    campoReal:
      "cantidad_metros",

    unidad: "M",

    activo: 1,

    notas:
      "Incluido en SAP principal. Logica historica: suma fila por fila.",
  },

  {
    puestoSap: "447SB",
    maquina: "447",
    proceso: "LAMINACION",

    campoPlan:
      "cantidad_operacion",

    campoReal:
      "cantidad_metros",

    unidad: "M",

    activo: 1,

    notas:
      "Variante SAP de maquina 447. Se consolida por fecha con 447SL.",
  },

  {
    puestoSap: "447SL",
    maquina: "447",
    proceso: "LAMINACION",

    campoPlan:
      "cantidad_operacion",

    campoReal:
      "cantidad_metros",

    unidad: "M",

    activo: 1,

    notas:
      "Variante SAP de maquina 447. Se consolida por fecha con 447SB.",
  },

  // ======================================================
  // GRAFILADORA
  // ======================================================

  {
    puestoSap: "431P",
    maquina: "431",
    proceso: "GRAFILADORA",

    campoPlan:
      "cantidad_operacion",

    campoReal:
      "cantidad_metros",

    unidad: "M",

    activo: 1,

    notas:
      "Incluido en SAP principal segun configuracion historica.",
  },

  /*
   * 465P apareció en SAP actual,
   * pero no estaba dentro del catálogo histórico oficial.
   *
   * Se conserva como conocido, pero no activo.
   */
  {
    puestoSap: "465P",
    maquina: "465",
    proceso: "GRAFILADORA",

    campoPlan:
      "cantidad_operacion",

    campoReal:
      "cantidad_metros",

    unidad: "M",

    activo: 0,

    notas:
      "Detectado en SAP actual. Pendiente validacion funcional. No incluido en SAP principal.",
  },

  // ======================================================
  // BOLSERA
  // ======================================================

  /*
   * IMPORTANTE:
   *
   * Bolsera NO participa en SAP principal.
   *
   * campoPlan y campoReal se llenan solamente porque
   * el esquema actual exige valores NOT NULL.
   *
   * activo = 0 evita que estos campos sean utilizados
   * en cumplimiento diario.
   */

  {
    puestoSap: "476P",
    maquina: "476",
    proceso: "BOLSERA",

    campoPlan:
      "cantidad_operacion",

    campoReal:
      "cantidad_notificada",

    unidad: "KG",

    activo: 0,

    notas:
      "Bolsera no se modifica desde SAP principal. Campos informativos unicamente; activo=0.",
  },

  {
    puestoSap: "478P",
    maquina: "478",
    proceso: "BOLSERA",

    campoPlan:
      "cantidad_operacion",

    campoReal:
      "cantidad_notificada",

    unidad: "KG",

    activo: 0,

    notas:
      "Bolsera no se modifica desde SAP principal. Campos informativos unicamente; activo=0.",
  },
];

/* =========================================================
   DESACTIVAR CONFIGURACION ANTERIOR
========================================================= */

function desactivarTodo(): void {
  db.prepare(`
    UPDATE machine_mapping

    SET
      activo = 0,
      updated_at = CURRENT_TIMESTAMP
  `).run();
}

/* =========================================================
   GUARDAR CONFIGURACION
========================================================= */

function guardarMappings(): void {
  const upsert =
    db.prepare(`
      INSERT INTO machine_mapping (
        puesto_sap,
        maquina,
        proceso,
        unidad,
        campo_plan,
        campo_real,
        activo,
        notas,
        updated_at
      )

      VALUES (
        @puestoSap,
        @maquina,
        @proceso,
        @unidad,
        @campoPlan,
        @campoReal,
        @activo,
        @notas,
        CURRENT_TIMESTAMP
      )

      ON CONFLICT(puesto_sap)

      DO UPDATE SET
        maquina =
          excluded.maquina,

        proceso =
          excluded.proceso,

        unidad =
          excluded.unidad,

        campo_plan =
          excluded.campo_plan,

        campo_real =
          excluded.campo_real,

        activo =
          excluded.activo,

        notas =
          excluded.notas,

        updated_at =
          CURRENT_TIMESTAMP
    `);

  const transaction =
    db.transaction(
      (
        rows:
          MappingProduccion[]
      ) => {
        for (
          const row of rows
        ) {
          upsert.run(
            row
          );
        }
      }
    );

  transaction(
    mappings
  );
}

/* =========================================================
   MOSTRAR CONFIGURACION
========================================================= */

function mostrarConfiguracion(): void {
  const activos =
    mappings.filter(
      (row) =>
        row.activo ===
        1
    );

  const inactivos =
    mappings.filter(
      (row) =>
        row.activo ===
        0
    );

  console.log(
    "\nCONFIGURACION SAP PRINCIPAL"
  );

  console.log(
    "-".repeat(
      105
    )
  );

  console.log(
    [
      "PUESTO".padEnd(
        9
      ),

      "MAQUINA".padEnd(
        9
      ),

      "PROCESO".padEnd(
        16
      ),

      "ESTADO".padEnd(
        12
      ),

      "PLAN".padEnd(
        22
      ),

      "REAL".padEnd(
        22
      ),

      "U/M",
    ].join(
      " | "
    )
  );

  console.log(
    "-".repeat(
      105
    )
  );

  for (
    const row of mappings
  ) {
    const estado =
      row.activo ===
      1
        ? "INCLUIDO"
        : "IGNORADO";

    console.log(
      [
        row.puestoSap
          .padEnd(
            9
          ),

        row.maquina
          .padEnd(
            9
          ),

        row.proceso
          .padEnd(
            16
          ),

        estado
          .padEnd(
            12
          ),

        row.campoPlan
          .padEnd(
            22
          ),

        row.campoReal
          .padEnd(
            22
          ),

        row.unidad,
      ].join(
        " | "
      )
    );
  }

  console.log(
    "-".repeat(
      105
    )
  );

  console.log(
    `Incluidos SAP principal: ${activos.length}`
  );

  console.log(
    `Conocidos pero ignorados: ${inactivos.length}`
  );
}

/* =========================================================
   VALIDACION
========================================================= */

function validarConfiguracion(): void {
  const activos =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM
        machine_mapping

      WHERE
        activo = 1
    `)
    .get() as {
      total: number;
    };

  /*
   * Debemos tener exactamente:
   *
   * IMPRESION:
   * 410P
   * 424P
   * 429P
   *
   * LAMINACION:
   * 430P
   * 444P
   * 446P
   * 447SB
   * 447SL
   *
   * GRAFILADORA:
   * 431P
   *
   * TOTAL = 9
   */

  if (
    activos.total !==
    9
  ) {
    throw new Error(
      `Se esperaban 9 puestos activos y se encontraron ${activos.total}.`
    );
  }

  const bolseraActiva =
    db.prepare(`
      SELECT
        COUNT(*) AS total

      FROM
        machine_mapping

      WHERE
        proceso =
        'BOLSERA'

        AND activo =
        1
    `)
    .get() as {
      total: number;
    };

  if (
    bolseraActiva.total !==
    0
  ) {
    throw new Error(
      "Bolsera no puede estar activa en SAP principal."
    );
  }

  const maquina465 =
    db.prepare(`
      SELECT
        activo

      FROM
        machine_mapping

      WHERE
        puesto_sap =
        '465P'
    `)
    .get() as {
      activo: number;
    } | undefined;

  if (
    maquina465 &&
    maquina465.activo !==
    0
  ) {
    throw new Error(
      "465P debe permanecer inactivo hasta validacion funcional."
    );
  }
}

/* =========================================================
   MAIN
========================================================= */

function main(): void {
  logger.info(
    "=================================="
  );

  logger.info(
    "CONFIGURANDO MAPEO PRODUCTIVO"
  );

  logger.info(
    "=================================="
  );

  /*
   * Evitamos que configuraciones experimentales
   * anteriores queden activas.
   */
  desactivarTodo();

  guardarMappings();

  validarConfiguracion();

  mostrarConfiguracion();

  const activos =
    mappings.filter(
      (row) =>
        row.activo ===
        1
    ).length;

  const inactivos =
    mappings.filter(
      (row) =>
        row.activo ===
        0
    ).length;

  logger.info(
    {
      activos,
      inactivos,
    },
    "Configuracion productiva guardada"
  );

  logger.info(
    "=================================="
  );

  logger.info(
    "MAPEO PRODUCTIVO COMPLETADO"
  );

  logger.info(
    "=================================="
  );
}

main();