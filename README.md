# Control de Carrocería — B10 / B05

Aplicación web de inspección de carrocería con Firebase Firestore.

## Modelos

La primera pantalla permite seleccionar:
- B10 — mantiene los controles y datos existentes.
- B05 — incorpora su checklist específico.

Los controles configurables se sincronizan por modelo:
- B10: `inspecciones/__config_controles`
- B05: `inspecciones/__config_controles_b05`

Las inspecciones se guardan en la colección `inspecciones` con el campo `modelo`. Los registros históricos anteriores que no tienen ese campo se consideran B10 para mantener compatibilidad.

## B05

1. VIN — REGRABADO
2. CORDÓN LÁSER — IZQ / DCHO
3. PASACABLES — PDI / PDD / PTI / PTD
4. ENGATILLADO PUERTAS — PDI / PDD / PTI / PTD
5. PESTAÑAS CONTORNO — PDI / PDD / PTI / PTD / PORTÓN
6. REVISAR REBOSE PASTA — PDI / PDD / PTI / PTD
7. ORIFICIO FRENO PUERTAS — PDI / PDD / PTI / PTD
8. AGARRAMANOS — IZQ / DCHO
9. REVISAR ORIFICIOS SUELO — CENTRAL / IZQ / DCHO
10. ORIFICIOS PUERTAS DEFORMADOS — PDI / PDD / PTI / PTD / CAPO
11. PEGATINAS / PASTA EN TECHO — motivo libre
12. PAR DE APRIETE CRÍTICOS — PDI / PDD / PTI / PTD / BISAGRA CAPO A CARROCERÍA / BISAGRA CAPO A CAPO / TORNILLOS SUELO

## Funciones

- Carrocería nueva
- Historial por modelo
- Análisis de defectos por modelo
- Análisis por turnos
- PDF protegido por contraseña `0109`
- Alta/baja de controles protegida por contraseña `0109`
