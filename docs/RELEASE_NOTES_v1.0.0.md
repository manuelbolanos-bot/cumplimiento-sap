# Release Notes — V1.0.0

Fecha: 2026-09-24

## Entregado

La V1 automatiza el flujo mensual de cumplimiento de producción:

```text
SAP → SQLite → Drive/Bolsera → Vistas → Excel → CSV → BigQuery
```

## SAP

- Automatización de Fiori/WebGUI mediante Playwright.
- Consulta de ZPP10I → Recorrido → Reporte de Recorrido.
- Sociedad 0135.
- Parámetros de fecha configurables por CLI.
- Exportación XLSX capturada directamente desde la respuesta HTTP de SAP.
- RAW, STAGING y PROCESSED.
- Reemplazo transaccional por fecha.
- Alertas de puestos ignorados y órdenes de prueba.
- Modo `--solo-sap`.

## Navegador SAP

- Perfil persistente principal.
- Perfil de recuperación independiente.
- Recuperación automática si Chromium falla al iniciar.
- Descargas controladas mediante CDP.

## Bolsera

- Descarga automática desde Google Drive institucional.
- Soporte de Google Sheets exportado a XLSX.
- Hojas 476, 478 y SPOUT.
- Integración en SQLite como `DRIVE_BOLSERA`.

## Modelo consolidado

- `v_cumplimiento_diario` integra SAP + Bolsera.
- Vistas semanal, mensual, por sección y anual.
- Fuente SAP: `SAP_PRINCIPAL`.
- Fuente Bolsera: `DRIVE_BOLSERA`.

## Excel V3.3

- Hojas diarias.
- Semanas.
- MES.
- %.
- Resumen.
- Anual.
- Integración Bolsera.
- Inserción de 431, 476 y 478 dentro del bloque mensual de Anual.
- Meta reposicionada correctamente.
- Saneamiento de `#REF!`.
- Reparación de pivot.
- Recalculo automático.
- Validación estructural OOXML.
- Hojas heredadas `29 JUN` y `30 JUN` ocultas.

## BigQuery

- Exportación consolidada desde `v_cumplimiento_diario`.
- Conservación de metadatos SAP desde `v_bdd_normalizada`.
- Snapshot completo con `WRITE_TRUNCATE`.
- Compatible con Sandbox.
- Autenticación ADC.
- Cuenta institucional habilitada con permisos de consumo, jobs y edición de datos.

## Prueba integral de cierre

Rango ejecutado:

```text
2026-09-18 → 2026-09-24
```

Resultado:

```text
SAP:
386 filas descargadas
84 elegibles
302 ignoradas
7 fechas reemplazadas

Consolidado:
152 filas
23 días
10 máquinas
4 secciones

Fuentes:
SAP_PRINCIPAL 112
DRIVE_BOLSERA 40

BigQuery:
152 filas
23 días
10 máquinas
4 secciones
```

## Pendiente

`Transferido` no fue implementado porque su fuente/regla oficial aún no ha sido identificada.

## Tag recomendado

```text
v1.0.0
```
