# Checklist operativo — Cumplimiento Producción V1

## Antes de ejecutar

- [ ] Estoy en la rama/version productiva correcta.
- [ ] `.env` existe localmente.
- [ ] La sesión SAP es válida o puede autenticarse.
- [ ] Existe `data/templates/PLANTILLA_MAESTRA_LIMPIA.xlsx`.
- [ ] Existe `data/google-drive/token.json`.
- [ ] ADC de Google Cloud está autenticado.
- [ ] Las fechas `--desde` y `--hasta` pertenecen al mismo mes.

## Ejecución

```powershell
npm run proceso:mensual -- --desde=YYYY-MM-DD --hasta=YYYY-MM-DD
```

## Controles esperados

### SAP

- [ ] Chromium inició.
- [ ] ZPP10I abrió.
- [ ] Reporte de Recorrido abrió.
- [ ] Fechas fueron confirmadas en SAP.
- [ ] XLSX real fue capturado.
- [ ] RAW fue guardado.
- [ ] STAGING generado.
- [ ] PROCESSED generado.
- [ ] SQLite actualizado.

### Bolsera / Drive

- [ ] Fuente mensual correcta seleccionada.
- [ ] Google Sheet/XLSX descargado.
- [ ] 476 importada.
- [ ] 478 importada.
- [ ] SPOUT importada si contiene información.
- [ ] Registros anteriores del período reemplazados.

### Vistas

- [ ] `v_cumplimiento_diario` recreada.
- [ ] SAP principal disponible.
- [ ] DRIVE_BOLSERA disponible.
- [ ] Máquinas y secciones esperadas.

### Excel

- [ ] Diarias generadas.
- [ ] Semanales generadas.
- [ ] MES generado.
- [ ] % generado.
- [ ] Resumen generado.
- [ ] Anual actualizado.
- [ ] `#REF! = 0`.
- [ ] Validación OOXML correcta.
- [ ] Archivo abre normalmente en Microsoft Excel.

### Exportación BI

- [ ] CSV consolidado incluye `SAP_PRINCIPAL`.
- [ ] CSV consolidado incluye `DRIVE_BOLSERA`.
- [ ] Conteo CSV coincide con vista consolidada.
- [ ] Número de máquinas coincide.
- [ ] Número de secciones coincide.

### BigQuery

- [ ] Load job creado.
- [ ] Tabla reemplazada correctamente.
- [ ] Registros BigQuery = registros CSV.
- [ ] Días coinciden.
- [ ] Máquinas coinciden.
- [ ] Secciones coinciden.

## Si BigQuery pide reautenticación

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project cumplimiento-produccion-499118
npm run bigquery:sync
```

## Si Chromium falla al iniciar

El sistema intenta:

```text
data/browser-profile
```

y después:

```text
data/browser-profile-recovery
```

No borrar manualmente el perfil principal sin respaldo.

## Pendiente funcional conocido

```text
Transferido
```

Debe permanecer vacío hasta contar con la fuente/regla oficial.
