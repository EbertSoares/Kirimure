import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BTS_METEO_FALLBACK_SNAPSHOT,
  BTS_METEO_FRADES_FALLBACK_SNAPSHOT,
  fetchBtsMarineMeteo,
  findClosestHourlyPoint,
  getBtsMeteoHistoricalSnapshot,
  getMeteoCoordinates,
  normalizeUtcTimestamp,
} from './openMeteo';
import type { MarineMeteoPoint } from './types';

describe('serviço Open-Meteo Marine API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna coordenadas de consulta adequadas para cada setor', () => {
    const barra = getMeteoCoordinates('barra');
    const frades = getMeteoCoordinates('frades');
    const paraguacu = getMeteoCoordinates('paraguacu');

    expect(barra.latitude).toBeCloseTo(-12.97, 2);
    expect(barra.longitude).toBeCloseTo(-38.50, 2);

    expect(frades.latitude).toBeCloseTo(-12.85, 2);
    expect(paraguacu.latitude).toBeCloseTo(-12.75, 2);
  });

  it('localiza o ponto horário mais próximo ao horário de referência evitando índice zero arbitrário', () => {
    expect(findClosestHourlyPoint([])).toBeNull();

    const samplePoints: MarineMeteoPoint[] = [
      {
        timestampUtc: '2024-03-01T00:00:00Z',
        waveHeightM: 0.5,
        currentVelocityMs: 0.1,
        currentDirectionDeg: 90,
        seaLevelHeightM: 0.2,
        seaSurfaceTemperatureDegC: 27.5,
        gridCell: { latitude: -12.97, longitude: -38.50 },
        requestedCoordinates: { latitude: -12.97, longitude: -38.50 },
        spatialResolution: '8 km',
        hourlyUnits: {},
        provenance: BTS_METEO_FALLBACK_SNAPSHOT[0].provenance,
      },
      {
        timestampUtc: '2024-03-01T06:00:00Z',
        waveHeightM: 0.8,
        currentVelocityMs: 0.2,
        currentDirectionDeg: 110,
        seaLevelHeightM: 0.5,
        seaSurfaceTemperatureDegC: 27.8,
        gridCell: { latitude: -12.97, longitude: -38.50 },
        requestedCoordinates: { latitude: -12.97, longitude: -38.50 },
        spatialResolution: '8 km',
        hourlyUnits: {},
        provenance: BTS_METEO_FALLBACK_SNAPSHOT[0].provenance,
      },
      {
        timestampUtc: '2024-03-01T12:00:00Z',
        waveHeightM: 1.2,
        currentVelocityMs: 0.4,
        currentDirectionDeg: 140,
        seaLevelHeightM: 0.9,
        seaSurfaceTemperatureDegC: 28.4,
        gridCell: { latitude: -12.97, longitude: -38.50 },
        requestedCoordinates: { latitude: -12.97, longitude: -38.50 },
        spatialResolution: '8 km',
        hourlyUnits: {},
        provenance: BTS_METEO_FALLBACK_SNAPSHOT[0].provenance,
      },
    ];

    // Para 11:30 UTC, o ponto das 12:00:00Z é o mais próximo
    const target = new Date('2024-03-01T11:30:00Z');
    const closest = findClosestHourlyPoint(samplePoints, target);
    expect(closest?.timestampUtc).toBe('2024-03-01T12:00:00Z');
    expect(closest?.waveHeightM).toBe(1.2);

    // Para 01:00 UTC, o ponto das 00:00:00Z é o mais próximo
    const earlyTarget = new Date('2024-03-01T01:00:00Z');
    const earlyClosest = findClosestHourlyPoint(samplePoints, earlyTarget);
    expect(earlyClosest?.timestampUtc).toBe('2024-03-01T00:00:00Z');
  });

  it('converte velocidade de corrente de km/h para m/s dividindo por 3,6 quando indicado na unidade', async () => {
    const mockResponse = {
      latitude: -12.97,
      longitude: -38.50,
      hourly_units: {
        wave_height: 'm',
        ocean_current_velocity: 'km/h',
        ocean_current_direction: '°',
        sea_level_height_msl: 'm',
        sea_surface_temperature: '°C',
      },
      hourly: {
        time: ['2024-03-01T12:00:00Z'],
        wave_height: [1.25],
        ocean_current_velocity: [3.6], // 3.6 km/h = 1.0 m/s
        ocean_current_direction: [160],
        sea_level_height_msl: [0.8],
        sea_surface_temperature: [28.2],
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockResponse),
    } as Response);

    const points = await fetchBtsMarineMeteo('barra');
    expect(points.length).toBe(1);
    expect(points[0]!.currentVelocityMs).toBe(1.0);
    expect(points[0]!.hourlyUnits!.ocean_current_velocity).toBe('m/s');
    expect(points[0]!.waveHeightM).toBe(1.25);
    expect(points[0]!.currentDirectionDeg).toBe(160);
    expect(points[0]!.provenance.fetchStatus).toBe('online_valid');
  });

  it('preserva m/s diretamente quando a API já fornece nessa unidade e lida com valores ausentes', async () => {
    const mockResponse = {
      latitude: -12.97,
      longitude: -38.50,
      hourly_units: {
        ocean_current_velocity: 'm/s',
      },
      hourly: {
        time: ['2024-03-01T12:00:00Z'],
        wave_height: [null],
        ocean_current_velocity: [0.45],
        ocean_current_direction: [null],
        sea_level_height_msl: [null],
        sea_surface_temperature: [28.0],
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockResponse),
    } as Response);

    const points = await fetchBtsMarineMeteo('barra');
    expect(points.length).toBe(1);
    expect(points[0]!.currentVelocityMs).toBe(0.45);
    expect(points[0]!.waveHeightM).toBeNull();
    expect(points[0]!.currentDirectionDeg).toBeNull();
  });

  it('normaliza strings de data sem fuso para UTC anexando Z', () => {
    expect(normalizeUtcTimestamp('2026-10-28T12:00')).toBe('2026-10-28T12:00:00Z');
    expect(normalizeUtcTimestamp('2026-10-28T12:00:00Z')).toBe('2026-10-28T12:00:00Z');
    expect(normalizeUtcTimestamp('2026-10-28T12:00:00+00:00')).toBe('2026-10-28T12:00:00+00:00');
  });

  it('rejeita com erro em falha de rede em vez de substituir automaticamente por snapshot histórico', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await expect(fetchBtsMarineMeteo('barra'))
      .rejects
      .toThrow(/Network error/);
  });

  it('retorna snapshots históricos de contingência explicitamente sob demanda via getBtsMeteoHistoricalSnapshot', () => {
    const barra = getBtsMeteoHistoricalSnapshot('barra');
    expect(barra).toEqual(BTS_METEO_FALLBACK_SNAPSHOT);
    expect(barra[0]!.provenance.isCachedFallback).toBe(true);

    const frades = getBtsMeteoHistoricalSnapshot('frades');
    expect(frades).toEqual(BTS_METEO_FRADES_FALLBACK_SNAPSHOT);
  });
});
