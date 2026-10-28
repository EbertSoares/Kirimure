import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BTS_CRW_BARRA_FALLBACK_SNAPSHOT,
  BTS_CRW_FALLBACK_SNAPSHOT,
  fetchBtsThermalForcing,
  getDefaultCrwWindow,
  getSectorCoordinates,
} from './noaaCrw';

describe('serviço NOAA Coral Reef Watch (ERDDAP)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna coordenadas geográficas apropriadas para cada setor da BTS', () => {
    const frades = getSectorCoordinates('frades');
    const paraguacu = getSectorCoordinates('paraguacu');
    const barra = getSectorCoordinates('barra');

    expect(frades.latitude).toBeCloseTo(-12.85, 2);
    expect(frades.longitude).toBeCloseTo(-38.55, 2);

    expect(paraguacu.latitude).toBeCloseTo(-12.75, 2);
    expect(paraguacu.longitude).toBeCloseTo(-38.85, 2);

    expect(barra.latitude).toBeCloseTo(-12.97, 2);
    expect(barra.longitude).toBeCloseTo(-38.50, 2);
  });

  it('gera janela temporal padrão de 45 dias no formato ISO com meio-dia UTC', () => {
    const window = getDefaultCrwWindow();
    expect(window.startUtc).toMatch(/^\d{4}-\d{2}-\d{2}T12:00:00Z$/);
    expect(window.endUtc).toMatch(/^\d{4}-\d{2}-\d{2}T12:00:00Z$/);
    const startMs = new Date(window.startUtc).getTime();
    const endMs = new Date(window.endUtc).getTime();
    expect(endMs).toBeGreaterThan(startMs);
  });

  it('analisa CSV do ERDDAP com sucesso, isolando célula de grade e descartando flags de preenchimento', async () => {
    const sampleCsv = [
      'time,latitude,longitude,CRW_SST,CRW_SSTANOMALY,CRW_HOTSPOT,CRW_DHW,CRW_BAA,CRW_BAA_7D_MAX',
      'UTC,degrees_north,degrees_east,degree_C,degree_C,degree_C,degC_weeks,1,1',
      '2024-03-20T12:00:00Z,-12.875,-38.525,29.1,0.9,1.1,3.4,2,2',
      '2024-03-21T12:00:00Z,-12.875,-38.525,29.3,NaN,-999,3.6,2,2',
    ].join('\n');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => sampleCsv,
    } as Response);

    const points = await fetchBtsThermalForcing('frades', '2024-03-20T12:00:00Z', '2024-03-21T12:00:00Z');

    expect(points.length).toBe(2);

    // Primeiro ponto: todos os dados válidos
    expect(points[0]!.timestampUtc).toBe('2024-03-20T12:00:00Z');
    expect(points[0]!.seaSurfaceTemperatureDegC).toBe(29.1);
    expect(points[0]!.sstAnomalyDegC).toBe(0.9);
    expect(points[0]!.hotSpotDegC).toBe(1.1);
    expect(points[0]!.degreeHeatingWeeks).toBe(3.4);
    expect(points[0]!.bleachingAlertLevel).toBe(2);
    expect(points[0]!.gridCell).toEqual({ latitude: -12.875, longitude: -38.525 });
    expect(points[0]!.requestedCoordinates).toEqual({ latitude: -12.85, longitude: -38.55 });
    expect(points[0]!.provenance.fetchStatus).toBe('online_valid');
    expect(points[0]!.provenance.isCachedFallback).toBe(false);

    // Segundo ponto: NaN e -999 convertidos estritamente para null
    expect(points[1]!.sstAnomalyDegC).toBeNull();
    expect(points[1]!.hotSpotDegC).toBeNull();
    expect(points[1]!.seaSurfaceTemperatureDegC).toBe(29.3);
  });

  it('utiliza fallback histórico setorial ao receber erro HTTP', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response);

    const points = await fetchBtsThermalForcing('frades');
    expect(points).toEqual(BTS_CRW_FALLBACK_SNAPSHOT);
    expect(points[0]!.provenance.isCachedFallback).toBe(true);
    expect(points[0]!.provenance.fetchStatus).toBe('fallback_cached');
  });

  it('utiliza fallback histórico específico da Barra ao falhar a conexão remota', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline or timed out'));

    const points = await fetchBtsThermalForcing('barra');
    expect(points).toEqual(BTS_CRW_BARRA_FALLBACK_SNAPSHOT);
    expect(points[0]!.gridCell!.latitude).toBeCloseTo(-12.95, 2);
    expect(points[0]!.requestedCoordinates!.latitude).toBeCloseTo(-12.97, 2);
  });

  it('retorna array vazio para o Paraguaçu sem forjar dados quando não há cobertura satelital de 5 km', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Offline'));

    const points = await fetchBtsThermalForcing('paraguacu');
    expect(points).toEqual([]);
  });
});
