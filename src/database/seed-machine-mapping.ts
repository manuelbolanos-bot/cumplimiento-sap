import { db } from "./db.js";
import { logger } from "../utils/logger.js";

interface MappingCandidate {
  puestoSap: string;
  maquina: string;
  proceso:
    | "IMPRESION"
    | "LAMINACION"
    | "GRAFILADORA"
    | "BOLSERA";

  notas: string;
}

const mappings: MappingCandidate[] = [
  {
    puestoSap: "410P",
    maquina: "410",
    proceso: "IMPRESION",
    notas:
      "Mapeo candidato por coincidencia directa. Pendiente validacion funcional.",
  },

  {
    puestoSap: "424P",
    maquina: "424",
    proceso: "IMPRESION",
    notas:
      "Mapeo candidato por coincidencia directa. Pendiente validacion funcional.",
  },

  {
    puestoSap: "429P",
    maquina: "429",
    proceso: "IMPRESION",
    notas:
      "Mapeo candidato por coincidencia directa. Pendiente validacion funcional.",
  },

  {
    puestoSap: "430P",
    maquina: "430",
    proceso: "LAMINACION",
    notas:
      "Mapeo candidato por coincidencia directa. Pendiente validacion funcional.",
  },

  {
    puestoSap: "444P",
    maquina: "444",
    proceso: "LAMINACION",
    notas:
      "Mapeo candidato por coincidencia directa. Pendiente validacion funcional.",
  },

  {
    puestoSap: "446P",
    maquina: "446",
    proceso: "LAMINACION",
    notas:
      "Mapeo candidato por coincidencia directa. Pendiente validacion funcional.",
  },

  {
    puestoSap: "447SB",
    maquina: "447",
    proceso: "LAMINACION",
    notas:
      "Variante SAP 447SB. Pendiente confirmar si se consolida con 447SL como maquina 447.",
  },

  {
    puestoSap: "447SL",
    maquina: "447",
    proceso: "LAMINACION",
    notas:
      "Variante SAP 447SL. Pendiente confirmar si se consolida con 447SB como maquina 447.",
  },

  {
    puestoSap: "431P",
    maquina: "431",
    proceso: "GRAFILADORA",
    notas:
      "Mapeo candidato por coincidencia directa. Pendiente validacion funcional.",
  },

  {
    puestoSap: "465P",
    maquina: "465",
    proceso: "GRAFILADORA",
    notas:
      "Mapeo candidato por coincidencia directa. Pendiente validacion funcional.",
  },

  {
    puestoSap: "476P",
    maquina: "476",
    proceso: "BOLSERA",
    notas:
      "Mapeo candidato por coincidencia directa. Pendiente validacion funcional.",
  },

  {
    puestoSap: "478P",
    maquina: "478",
    proceso: "BOLSERA",
    notas:
      "Mapeo candidato por coincidencia directa. Pendiente validacion funcional.",
  },
];

function main(): void {
  logger.info(
    "=================================="
  );

  logger.info(
    "MAPEO CANDIDATO DE MAQUINAS"
  );

  logger.info(
    "=================================="
  );

  /*
   * Importante:
   *
   * activo = 0
   *
   * Todavia NO queremos que estos registros
   * participen automaticamente en cumplimiento.
   *
   * campo_plan / campo_real se llenan temporalmente
   * solo porque el esquema actual los exige.
   *
   * NO significan que la formula este aprobada.
   */
  const statement =
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
        NULL,
        'cantidad_operacion',
        'cantidad_metros',
        0,
        @notas,
        CURRENT_TIMESTAMP
      )

      ON CONFLICT(puesto_sap)
      DO UPDATE SET
        maquina = excluded.maquina,
        proceso = excluded.proceso,
        unidad = excluded.unidad,
        campo_plan = excluded.campo_plan,
        campo_real = excluded.campo_real,
        activo = excluded.activo,
        notas = excluded.notas,
        updated_at = CURRENT_TIMESTAMP
    `);

  const insertar =
    db.transaction(
      (
        registros: MappingCandidate[]
      ) => {
        for (
          const registro of registros
        ) {
          statement.run(
            registro
          );
        }
      }
    );

  insertar(
    mappings
  );

  console.log(
    "\nMAPEOS CANDIDATOS"
  );

  console.log(
    "-".repeat(72)
  );

  for (
    const mapping of mappings
  ) {
    console.log(
      `${mapping.puestoSap.padEnd(
        8
      )} -> ${mapping.maquina.padEnd(
        6
      )} | ${mapping.proceso}`
    );
  }

  console.log(
    "-".repeat(72)
  );

  console.log(
    `Total candidatos: ${mappings.length}`
  );

  console.log(
    "\nIMPORTANTE:"
  );

  console.log(
    "Todos fueron guardados con activo = 0."
  );

  console.log(
    "Todavia no participan en calculos de cumplimiento."
  );

  logger.info(
    {
      mappings:
        mappings.length,
    },
    "Mapeo candidato guardado"
  );

  logger.info(
    "=================================="
  );

  logger.info(
    "MAPEO COMPLETADO"
  );

  logger.info(
    "=================================="
  );
}

main();