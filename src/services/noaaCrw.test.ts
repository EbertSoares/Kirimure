import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BTS_CRW_BARRA_FALLBACK_SNAPSHOT,
  BTS_CRW_FALLBACK_SNAPSHOT,
  CRW_DISTRIBUTORS,
  fetchBtsThermalForcing,
  getBtsCrwHistoricalSnapshot,
  getDefaultCrwWindow,
  getNoaaPixel,
  getSectorCoordinates,
  parseErddapCrwCsv,
  splitTimeWindowIntoChunks,
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
    expect(barra.latitude).toBeCloseTo(-12.97, 2);
  });

  it('mapeia pixels oceânicos válidos para cada setor', () => {
    const fradesPixel = getNoaaPixel('frades');
    const barraPixel = getNoaaPixel('barra');
    expect(fradesPixel.latitude).toBe(-12.875);
    expect(fradesPixel.longitude).toBe(-38.525);
    expect(barraPixel.latitude).toBe(-13.025);
    expect(barraPixel.longitude).toBe(-38.525);
  });

  it('gera janela temporal padrão com recuo de segurança de 48h (2 dias) contra atrasos de síntese operacional', () => {
    const window = getDefaultCrwWindow(45);
    expect(window.startUtc).toMatch(/^\d{4}-\d{2}-\d{2}T12:00:00Z$/);
    expect(window.endUtc).toMatch(/^\d{4}-\d{2}-\d{2}T12:00:00Z$/);

    const nowMs = Date.now();
    const endMs = new Date(window.endUtc).getTime();
    const diffHours = (nowMs - endMs) / (3600 * 1000);
    expect(diffHours).toBeGreaterThanOrEqual(24);
  });

  it('divide intervalos longos em blocos de até 15 dias para proteger o ERDDAP contra timeouts', () => {
    const chunks = splitTimeWindowIntoChunks('2024-03-01T12:00:00Z', '2024-04-15T12:00:00Z', 15);
    expect(chunks.length).toBe(3);
    expect(chunks[0].startUtc).toBe('2024-03-01T12:00:00Z');
    expect(chunks[0].endUtc).toBe('2024-03-16T12:00:00Z');
    expect(chunks[2].endUtc).toBe('2024-04-15T12:00:00Z');
  });

  it('interpreta CSV do ERDDAP pelos nomes das colunas, independentemente da ordem', () => {
    // Ordem invertida propositalmente das colunas para comprovar robustez do parser
    const permutedCsv = [
      'CRW_DHW,CRW_BAA,time,CRW_SST,CRW_HOTSPOT,CRW_SSTANOMALY,CRW_BAA_7D_MAX,latitude,longitude',
      'degC_weeks,1,UTC,degree_C,degree_C,degree_C,1,degrees_north,degrees_east',
      '3.4,2,2026-10-20T12:00:00Z,27.8,0.5,1.2,2,-12.875,-38.525',
    ].join('\n');

    const rows = parseErddapCrwCsv(permutedCsv);
    expect(rows).toHaveLength(1);
    expect(rows[0].timestampUtc).toBe('2026-10-20T12:00:00Z');
    expect(rows[0].sst).toBe(27.8);
    expect(rows[0].dhw).toBe(3.4);
    expect(rows[0].hotSpot).toBe(0.5);
    expect(rows[0].sstAnomaly).toBe(1.2);
    expect(rows[0].baa).toBe(2);
    expect(rows[0].latitude).toBe(-12.875);
    expect(rows[0].longitude).toBe(-38.525);
  });

  it('lança RemoteDataError("parse") se colunas mandatórias estiverem ausentes no CSV', () => {
    const invalidCsv = [
      'time,latitude,longitude,OTHER_VAR',
      'UTC,degrees_north,degrees_east,units',
      '2026-10-20T12:00:00Z,-12.875,-38.525,123',
    ].join('\n');

    expect(() => parseErddapCrwCsv(invalidCsv)).toThrow(/sem as colunas obrigatórias/);
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
    expect(points[0]!.timestampUtc).toBe('2024-03-20T12:00:00Z');
    expect(points[0]!.seaSurfaceTemperatureDegC).toBe(29.1);
    expect(points[0]!.sstAnomalyDegC).toBe(0.9);
    expect(points[0]!.hotSpotDegC).toBe(1.1);
    expect(points[0]!.degreeHeatingWeeks).toBe(3.4);
    expect(points[0]!.bleachingAlertLevel).toBe(2);
    expect(points[0]!.gridCell).toEqual({ latitude: -12.875, longitude: -38.525 });
    expect(points[0]!.provenance.fetchStatus).toBe('online_valid');
    expect(points[0]!.provenance.isCachedFallback).toBe(false);

    // Segundo ponto: NaN e -999 convertidos estritamente para null
    expect(points[1]!.sstAnomalyDegC).toBeNull();
    expect(points[1]!.hotSpotDegC).toBeNull();
    expect(points[1]!.seaSurfaceTemperatureDegC).toBe(29.3);
  });

  it('rejeita com erro explícito ao receber erro HTTP sem injetar silenciosamente o snapshot histórico', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'Error { code=503; message="Service Unavailable"; }',
    } as Response);

    await expect(fetchBtsThermalForcing('frades', '2024-03-01T12:00:00Z', '2024-03-10T12:00:00Z'))
      .rejects
      .toThrow(/HTTP 503/);
  });

  it('rejeita com erro explícito em falha de conexão de rede após tentar repetição', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network connect timeout'));

    await expect(fetchBtsThermalForcing('barra', '2024-03-01T12:00:00Z', '2024-03-10T12:00:00Z'))
      .rejects
      .toThrow(/Network connect timeout/);
  });

  it('rejeita com RemoteDataError("no_data") quando a resposta contém apenas NaNs para o pixel', async () => {
    const allNanCsv = [
      'time,latitude,longitude,CRW_SST,CRW_SSTANOMALY,CRW_HOTSPOT,CRW_DHW,CRW_BAA,CRW_BAA_7D_MAX',
      'UTC,degrees_north,degrees_east,degree_C,degree_C,degree_C,degC_weeks,1,1',
      '2026-10-20T12:00:00Z,-12.875,-38.525,NaN,NaN,NaN,NaN,NaN,NaN',
    ].join('\n');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => allNanCsv,
    } as Response);

    await expect(fetchBtsThermalForcing('frades', '2026-10-20T12:00:00Z', '2026-10-21T12:00:00Z'))
      .rejects
      .toThrow(/sem SST válida/);
  });

  it('retorna snapshot histórico de contingência explicitamente sob demanda via getBtsCrwHistoricalSnapshot', () => {
    const fradesSnapshot = getBtsCrwHistoricalSnapshot('frades');
    expect(fradesSnapshot).toEqual(BTS_CRW_FALLBACK_SNAPSHOT);
    expect(fradesSnapshot[0]!.provenance.isCachedFallback).toBe(true);

    const barraSnapshot = getBtsCrwHistoricalSnapshot('barra');
    expect(barraSnapshot).toEqual(BTS_CRW_BARRA_FALLBACK_SNAPSHOT);
  });

  it('retorna array vazio para o Paraguaçu sem requisição de rede devido a mascaramento de terra na grade de 5 km', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const points = await fetchBtsThermalForcing('paraguacu');
    expect(points).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
