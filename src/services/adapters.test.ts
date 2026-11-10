import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BTS_CRW_FALLBACK_SNAPSHOT,
  fetchBtsThermalForcing,
  getBtsCrwHistoricalSnapshot,
  getSectorCoordinates,
} from './noaaCrw';
import {
  BTS_METEO_FALLBACK_SNAPSHOT,
  fetchBtsMarineMeteo,
  getMeteoCoordinates,
} from './openMeteo';

describe('camada de serviços de dados oceanográficos e proveniência', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fornece snapshot calibrado do NOAA CRW para a Baía de Todos-os-Santos', () => {
    const points = getBtsCrwHistoricalSnapshot('frades');
    expect(points.length).toBeGreaterThan(0);

    const first = points[0];
    expect(first.seaSurfaceTemperatureDegC).toBeGreaterThan(25.0);
    expect(first.degreeHeatingWeeks).toBeGreaterThanOrEqual(0);
    expect(first.provenance.sourceName).toBe('NOAA Coral Reef Watch (CRW)');
    expect(first.provenance.epistemicClass).toBe('Produto de Modelo');
    expect(first.provenance.datasetId).toBe('NOAA_DHW');
  });

  it('mapeia coordenadas geográficas distintas por setor da BTS para NOAA e Open-Meteo', () => {
    const frades = getSectorCoordinates('frades');
    const paraguacu = getSectorCoordinates('paraguacu');
    const barra = getSectorCoordinates('barra');

    expect(frades.latitude).toBe(-12.85);
    expect(frades.longitude).toBe(-38.55);

    expect(paraguacu.latitude).toBe(-12.75);
    expect(paraguacu.longitude).toBe(-38.85);

    expect(barra.latitude).toBe(-12.97);
    expect(barra.longitude).toBe(-38.50);

    const meteoBarra = getMeteoCoordinates('barra');
    expect(meteoBarra.latitude).toBe(-12.97);
  });

  it('preserva integridade do snapshot de contingência do NOAA CRW', () => {
    expect(BTS_CRW_FALLBACK_SNAPSHOT).toHaveLength(4);
    const maxStress = BTS_CRW_FALLBACK_SNAPSHOT[3];
    expect(maxStress.bleachingAlertLevel).toBe(4); // Alert 2
    expect(maxStress.bleachingAlertMax7d).toBe(4);
    expect(maxStress.bleachingAlertSourceVariable).toBe('CRW_BAA');
    expect('bleachingAlertArea' in maxStress).toBe(false);
    expect(maxStress.degreeHeatingWeeks).toBe(8.2);
    expect(maxStress.requestedCoordinates?.latitude).toBe(-12.85);
    expect(maxStress.spatialResolution).toContain('5 km');
    expect(maxStress.provenance.isCachedFallback).toBe(true);
    expect(maxStress.provenance.fetchStatus).toBe('fallback_cached');
    expect(maxStress.provenance.fallbackNote).toContain('Snapshot histórico de contingência');
  });

  it('não contamina setores estuarinos interiores com snapshots de mar aberto e sinaliza no_coverage', async () => {
    // Paraguaçu não possui pixel de mar aberto na grade satelital de 5 km (mascaramento de terra)
    await expect(fetchBtsThermalForcing('paraguacu')).rejects.toThrow(/não fornece dados válidos para representar este canal interno/);
  });

  it('fornece dados hidrodinâmicos e de ondas da Open-Meteo Marine com resposta estruturada', async () => {
    const mockMeteoJson = {
      latitude: -12.97,
      longitude: -38.50,
      hourly_units: {
        wave_height: 'm',
        ocean_current_velocity: 'm/s',
        ocean_current_direction: '°',
        sea_level_height_msl: 'm',
        sea_surface_temperature: '°C',
      },
      hourly: {
        time: ['2026-10-28T12:00:00Z'],
        wave_height: [1.3],
        ocean_current_velocity: [0.42],
        ocean_current_direction: [155],
        sea_level_height_msl: [0.6],
        sea_surface_temperature: [28.3],
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockMeteoJson),
    } as Response);

    const meteo = await fetchBtsMarineMeteo('barra');
    expect(meteo.length).toBeGreaterThan(0);

    const sample = meteo[0];
    expect(sample.waveHeightM).toBe(1.3);
    expect(sample.currentVelocityMs).toBe(0.42);
    expect(sample.provenance.sourceName).toBe('Open-Meteo Marine Weather API');
    expect(sample.provenance.epistemicClass).toBe('Produto de Modelo');
  });

  it('preserva integridade do snapshot de contingência meteorológico', () => {
    expect(BTS_METEO_FALLBACK_SNAPSHOT).toHaveLength(3);
    expect(BTS_METEO_FALLBACK_SNAPSHOT[0].waveHeightM).toBe(1.1);
    expect(BTS_METEO_FALLBACK_SNAPSHOT[0].provenance.isCachedFallback).toBe(true);
    expect(BTS_METEO_FALLBACK_SNAPSHOT[0].provenance.fetchStatus).toBe('fallback_cached');
  });

  it('padroniza as 5 origens de dados canônicas e rótulos de qualidade', async () => {
    const { getOriginLabel, getQualityLabel } = await import('./types');
    expect(getOriginLabel('in-situ')).toBe('Medição In-situ');
    expect(getOriginLabel('satellite-derived')).toBe('Estimativa Satelital');
    expect(getOriginLabel('external-model')).toBe('Modelo Oceânico Externo');
    expect(getOriginLabel('kirimure-model')).toBe('Modelo Numérico Kirimurê');
    expect(getOriginLabel('didactic-assumption')).toBe('Cenário Didático');

    expect(getQualityLabel('valid')).toBe('Válido');
    expect(getQualityLabel('questionable')).toContain('Suspeita');
    expect(getQualityLabel('masked')).toContain('Mascarado');
    expect(getQualityLabel('unavailable')).toBe('Indisponível');
  });

  it('respeita a restrição estrita: nenhum pixel de grade NOAA tem coordenadas expostas na UI', async () => {
    // Importa o código-fonte como string via Vite ?raw para verificação estática
    const evidenceDrawerModule = await import('../components/EvidenceDrawer.tsx?raw');
    const brazilMapModule = await import('../components/BrazilMapScreen.tsx?raw');

    const evidenceDrawerCode = evidenceDrawerModule.default;
    const brazilMapCode = brazilMapModule.default;

    // Não deve conter interpolação de latitude/longitude de gridCell para NOAA na UI
    expect(evidenceDrawerCode).not.toMatch(/latestCrw\.gridCell(\?|\.)latitude/);
    expect(brazilMapCode).not.toContain('gridCell');
    expect(brazilMapCode).not.toContain('NOAA');
  });
});
