import { describe, expect, it } from 'vitest';
import { BTS_CRW_FALLBACK_SNAPSHOT, fetchBtsThermalForcing } from './noaaCrw';
import { BTS_METEO_FALLBACK_SNAPSHOT, fetchBtsMarineMeteo } from './openMeteo';

describe('camada de serviços de dados oceanográficos e proveniência', () => {
  it('fornece snapshot calibrado do NOAA CRW para a Baía de Todos-os-Santos', async () => {
    const points = await fetchBtsThermalForcing();
    expect(points.length).toBeGreaterThan(0);

    const first = points[0];
    expect(first.seaSurfaceTemperatureDegC).toBeGreaterThan(25.0);
    expect(first.degreeHeatingWeeks).toBeGreaterThanOrEqual(0);
    expect(first.provenance.sourceName).toBe('NOAA Coral Reef Watch (CRW)');
    expect(first.provenance.epistemicClass).toBe('Produto de Modelo');
    expect(first.provenance.datasetId).toBe('NOAA_DHW');
  });

  it('preserva integridade do snapshot de contingência do NOAA CRW', () => {
    expect(BTS_CRW_FALLBACK_SNAPSHOT).toHaveLength(4);
    const maxStress = BTS_CRW_FALLBACK_SNAPSHOT[3];
    expect(maxStress.bleachingAlertLevel).toBe(4); // Alert 2
    expect(maxStress.bleachingAlertArea).toBe(4);
    expect(maxStress.degreeHeatingWeeks).toBe(8.2);
    expect(maxStress.provenance.isCachedFallback).toBe(true);
    expect(maxStress.provenance.fallbackNote).toContain('Snapshot histórico de contingência');
  });

  it('fornece dados hidrodinâmicos e de ondas da Open-Meteo Marine', async () => {
    const meteo = await fetchBtsMarineMeteo();
    expect(meteo.length).toBeGreaterThan(0);

    const sample = meteo[0];
    expect(sample.waveHeightM).toBeGreaterThan(0);
    expect(sample.currentVelocityMs).toBeGreaterThan(0);
    expect(sample.provenance.sourceName).toBe('Open-Meteo Marine Weather API');
    expect(sample.provenance.epistemicClass).toBe('Produto de Modelo');
  });

  it('preserva integridade do snapshot de contingência meteorológico', () => {
    expect(BTS_METEO_FALLBACK_SNAPSHOT).toHaveLength(3);
    expect(BTS_METEO_FALLBACK_SNAPSHOT[0].waveHeightM).toBe(1.1);
  });
});
