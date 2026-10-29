import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CORAL_WATCH_API_BASE,
  fetchCoralWatchCurrent,
  mapCoralWatchRecordToThermalPoint,
  validateAlertLevel,
} from './coralWatchApi';

describe('adaptador da Coral Watch Virtual Station API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('valida estritamente níveis de alerta na escala estendida NOAA CRW entre 0 e 7, convertendo 251 (_FillValue) e inválidos para null', () => {
    expect(validateAlertLevel(0)).toBe(0);
    expect(validateAlertLevel(1)).toBe(1);
    expect(validateAlertLevel(2)).toBe(2);
    expect(validateAlertLevel(3)).toBe(3);
    expect(validateAlertLevel(4)).toBe(4);
    expect(validateAlertLevel(5)).toBe(5);
    expect(validateAlertLevel(6)).toBe(6);
    expect(validateAlertLevel(7)).toBe(7);

    // Valores fora do domínio oficial ou flags de preenchimento NOAA
    expect(validateAlertLevel(251)).toBeNull();
    expect(validateAlertLevel(255)).toBeNull();
    expect(validateAlertLevel(-1)).toBeNull();
    expect(validateAlertLevel(8)).toBeNull();
    expect(validateAlertLevel('invalid')).toBeNull();
    expect(validateAlertLevel(null)).toBeNull();
    expect(validateAlertLevel(undefined)).toBeNull();
  });

  it('converte registro JSON da Coral Watch API para formato ThermalForcingPoint preservando percentis', () => {
    const sampleStation = {
      slug: 'todos_os_santos',
      name: 'Todos os Santos, Brazil',
      latitude: -13.375,
      longitude: -38.375,
      region: 'Atlantic Ocean',
      subregion: 'Brazil',
      avg_max_monthly_mean: 27.9214,
      bleaching_threshold: 28.9214,
    };

    const sampleRecord = {
      date: '2026-10-26',
      sst_min: 26.57,
      sst_max: 28.1,
      sst_90th_hs: 27.39,
      ssta_90th_hs: 1.6213,
      hs_90th: 0.2,
      dhw: 1.5,
      baa_7day_max: 1,
      stress_level: 1,
    };

    const point = mapCoralWatchRecordToThermalPoint(sampleRecord, sampleStation, {
      queryUrl: `${CORAL_WATCH_API_BASE}/stations/todos_os_santos/current`,
      responseHash: 'abcd1234',
      responseTimeMs: 150,
      retrievedAtUtc: '2026-10-28T16:00:00Z',
      note: 'Estação virtual de teste',
    });

    expect(point.timestampUtc).toBe('2026-10-26T12:00:00Z');
    // SST média representativa (26.57 + 28.1) / 2
    expect(point.seaSurfaceTemperatureDegC).toBeCloseTo(27.335, 3);
    // Campos específicos da estação virtual preservados sem sobreposição incorreta
    expect(point.sst90thPercentileDegC).toBe(27.39);
    expect(point.sstMinDegC).toBe(26.57);
    expect(point.sstMaxDegC).toBe(28.1);
    expect(point.isVirtualStation).toBe(true);
    expect(point.virtualStationName).toBe('Todos os Santos, Brazil');
    expect(point.virtualStationStressLevel).toBe(1);
    expect(point.bleachingAlertMax7d).toBe(1);
    expect(point.bleachingAlertSourceVariable).toBe('baa_7day_max');
    expect(point.climatologyMmmDegC).toBeCloseTo(27.9214, 4);
    expect('bleachingAlertArea' in point).toBe(false);
    expect(point.sstAnomalyDegC).toBe(1.6213);
    expect(point.hotSpotDegC).toBe(0.2);
    expect(point.degreeHeatingWeeks).toBe(1.5);
    expect(point.bleachingAlertLevel).toBe(1);
    expect(point.gridCell).toEqual({ latitude: -13.375, longitude: -38.375 });
    expect(point.provenance.distributor).toBe('Coral Watch API (api.coral.tsr.lol)');
    expect(point.provenance.fetchStatus).toBe('online_valid');
  });

  it('rejeita com RemoteDataError("no_coverage") para setor Paraguaçu sem efetuar requisição de rede', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(fetchCoralWatchCurrent('paraguacu')).rejects.toThrow(/não fornece dados válidos para representar este canal interno/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('consulta endpoint /stations/todos_os_santos/current e processa resposta com sucesso', async () => {
    const mockJson = {
      slug: 'todos_os_santos',
      name: 'Todos os Santos, Brazil',
      latitude: -13.375,
      longitude: -38.375,
      region: 'Atlantic Ocean',
      subregion: 'Brazil',
      avg_max_monthly_mean: 27.92,
      bleaching_threshold: 28.92,
      current: {
        date: '2026-10-26',
        sst_min: 26.5,
        sst_max: 28.0,
        sst_90th_hs: 27.5,
        ssta_90th_hs: 0.8,
        hs_90th: 0,
        dhw: 0,
        baa_7day_max: 0,
        stress_level: 0,
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockJson),
    } as Response);

    const points = await fetchCoralWatchCurrent('frades');
    expect(points).toHaveLength(1);
    expect(points[0].seaSurfaceTemperatureDegC).toBe(27.25);
    expect(points[0].sst90thPercentileDegC).toBe(27.5);
    expect(points[0].sstMinDegC).toBe(26.5);
    expect(points[0].sstMaxDegC).toBe(28.0);
    expect(points[0].isVirtualStation).toBe(true);
    expect(points[0].bleachingAlertLevel).toBe(0);
    expect(points[0].provenance.sourceName).toContain('Coral Watch');
  });
});
