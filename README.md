# Cumplimiento Producción — V1

Sistema de automatización para consolidar cumplimiento de producción desde SAP y la fuente mensual de Bolsera, generar el libro Excel corporativo y publicar el snapshot consolidado en BigQuery.

## Estado de la versión

**Versión:** V1.0.0  
**Estado:** Operativa  
**Fecha de cierre:** 2026-09-24

Flujo validado de extremo a extremo:

```text
SAP
  ↓
RAW
  ↓
STAGING
  ↓
PROCESSED
  ↓
SQLite
  ↓
Google Drive institucional
  ↓
BOLSERA
  ↓
Vistas consolidadas
  ↓
Excel mensual V3.3
  ↓
CSV consolidado
  ↓
BigQuery
```

## Comando maestro

Ejecutar un rango dentro del mismo mes:

```powershell
npm run proceso:mensual -- --desde=2026-09-18 --hasta=2026-09-24
```

Para un solo día:

```powershell
npm run proceso:mensual -- --desde=2026-09-24 --hasta=2026-09-24
```

La V1 genera un único libro mensual por ejecución, por lo que `--desde` y `--hasta` deben pertenecer al mismo mes.

## Etapas del proceso maestro

1. Extrae SAP mediante Playwright.
2. Procesa RAW → STAGING → PROCESSED.
3. Reemplaza en SQLite únicamente las fechas SAP incluidas en la ejecución.
4. Descarga la fuente mensual desde Google Drive.
5. Importa Bolsera a SQLite.
6. Reconstruye las vistas semánticas consolidadas.
7. Genera el libro Excel mensual V3.3.
8. Exporta la BDD consolidada a CSV.
9. Reemplaza el snapshot productivo en BigQuery mediante `WRITE_TRUNCATE`.

## Fuentes

### SAP principal

Transacción:

```text
ZPP10I CON TABLA DE FORMULAS
→ Recorrido
→ Reporte de Recorrido
```

Sociedad:

```text
0135
```

Fuente técnica almacenada:

```text
SAP_ZPP10I
```

Fuente lógica BI:

```text
SAP_PRINCIPAL
```

### Bolsera

Fuente:

```text
DRIVE_BOLSERA
```

Hojas esperadas en la fuente mensual:

```text
476
478
SPOUT
```

Bolsera se mantiene separada del flujo SAP y se integra únicamente en la capa semántica consolidada.

## Reglas de negocio principales

- No deduplicar Plan por orden.
- Plan = suma fila a fila de `Cantidad de operación`.
- Real SAP = `Cantidad en Metros`.
- Excluir material de prueba `10249848`.
- Ignorar puestos SAP no configurados o configurados como no incluidos.
- SAP principal modifica únicamente IMPRESION, LAMINACION y GRAFILADORA.
- Bolsera proviene exclusivamente de `DRIVE_BOLSERA`.
- Diferencia = Real - Plan.
- Cumplimiento = Real / Plan.
- Reimportación SAP reemplaza únicamente las fechas incluidas.
- Reimportación Bolsera reemplaza el período mensual correspondiente.

## Mapeos SAP activos

```text
IMPRESION
410P → 410
424P → 424
429P → 429

LAMINACION
430P  → 430
444P  → 444
446P  → 446
447SB → 447
447SL → 447

GRAFILADORA
431P → 431
```

Fuera del SAP principal:

```text
465P
476P
478P
```

## SQLite

Base de datos:

```text
data/database/cumplimiento-produccion.db
```

Tablas relevantes:

```text
events
sync_runs
machine_mapping
import_runs
import_alerts
bolsera_daily
drive_period_folders
```

Vista semántica principal:

```text
v_cumplimiento_diario
```

Esta vista integra:

```text
SAP_PRINCIPAL
+
DRIVE_BOLSERA
```

## Excel mensual

Plantilla:

```text
data/templates/PLANTILLA_MAESTRA_LIMPIA.xlsx
```

Salida:

```text
data/excel-generado/
```

Generador:

```text
src/excel/generate-monthly-workbook.ts
```

Versión validada:

```text
V3.3
```

La V3.3 incluye:

- hojas diarias;
- hojas semanales;
- MES;
- %;
- Resumen;
- Anual;
- Bolsera;
- ocultamiento de hojas heredadas;
- reparación de pivots;
- recálculo completo al abrir;
- saneamiento de referencias `#REF!`;
- validación estructural OOXML.

## BigQuery

Proyecto:

```text
cumplimiento-produccion-499118
```

Dataset productivo:

```text
cumplimiento_produccion_v2
```

La sincronización trabaja como snapshot completo mediante `WRITE_TRUNCATE`, compatible con BigQuery Sandbox.

La BDD enviada a BigQuery debe provenir de la vista consolidada, no de la vista SAP-only.

Fuentes esperadas:

```text
SAP_PRINCIPAL
DRIVE_BOLSERA
```

## Autenticación Google

### Google Drive

OAuth institucional almacenado localmente en:

```text
data/google-drive/token.json
```

Nunca subir ese archivo a Git.

### BigQuery

Usa Application Default Credentials (ADC).

Autenticación:

```powershell
gcloud auth application-default login
```

Configurar quota project:

```powershell
gcloud auth application-default set-quota-project cumplimiento-produccion-499118
```

Roles utilizados por la cuenta institucional:

```text
Consumidor de Service Usage
Usuario de trabajo de BigQuery
Editor de datos de BigQuery
```

No almacenar tokens, refresh tokens, secretos OAuth ni credenciales en el repositorio.

## Scripts principales

```powershell
npm run pipeline -- --desde=YYYY-MM-DD --hasta=YYYY-MM-DD --solo-sap
npm run proceso:mensual -- --desde=YYYY-MM-DD --hasta=YYYY-MM-DD

npm run drive:login
npm run drive:configurar
npm run drive:descargar
npm run drive:procesar-mes

npm run bolsera:importar -- --archivo="..." --periodo=YYYY-MM

npm run excel:generar -- --anio=YYYY --mes=M
npm run export:bdd
npm run bigquery:sync
```

## Directorios importantes

```text
data/
├── browser-profile/
├── browser-profile-recovery/
├── database/
├── downloads-temp/
├── drive-temp/
├── excel-generado/
├── export/
├── google-drive/
├── processed/
├── raw/
│   └── sap/
├── staging/
├── templates/
└── tmp/
```

## Qué NO debe subirse a Git

Como mínimo:

```text
.env
data/google-drive/
data/browser-profile/
data/browser-profile-recovery/
data/downloads-temp/
data/drive-temp/
data/tmp/
```

También se recomienda excluir archivos generados que puedan reconstruirse automáticamente:

```text
data/raw/
data/staging/
data/processed/
data/export/
data/excel-generado/
```

La base SQLite debe respaldarse de forma controlada; no debe publicarse si contiene información productiva sensible.

## Pendientes conocidos

### Transferido

`Transferido` permanece pendiente porque todavía no se ha identificado la fuente oficial ni la regla de cálculo.

No inventar ni inferir ese valor.

### Mejoras posteriores a V1

- meses que requieren 5 semanas;
- semanas que cruzan entre dos meses;
- publicación automática del Excel final a Google Drive;
- automatización de ejecución programada;
- dashboard Looker Studio final;
- política de respaldos y retención;
- monitoreo/alertas del proceso maestro.

## Validación V1 realizada

Última corrida integral validada:

```text
Rango SAP: 2026-09-18 → 2026-09-24

BDD consolidada:
152 registros
23 días
10 máquinas
4 secciones

Fuentes:
SAP_PRINCIPAL: 112
DRIVE_BOLSERA: 40

BigQuery:
152 registros
23 días
10 máquinas
4 secciones
```

El flujo maestro terminó correctamente desde SAP hasta BigQuery.

---

## Regla operativa

Antes de modificar producción:

1. Crear una rama.
2. Ejecutar pruebas en un rango corto.
3. Revisar SQLite.
4. Revisar el Excel generado.
5. Verificar el CSV consolidado.
6. Sincronizar BigQuery.
7. Confirmar conteos finales.
8. Fusionar a `main`.
