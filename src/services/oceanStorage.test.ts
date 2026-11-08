import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSavedSst, saveSst, getSavedSstTime, clearSavedStorage } from './oceanStorage';

describe('oceanStorage', () => {
  beforeEach(() => {
    clearSavedStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna null quando não há temperatura salva', () => {
    expect(getSavedSst('frades')).toBeNull();
    expect(getSavedSstTime('frades')).toBeNull();
  });

  it('salva e recupera a temperatura corretamente por setor', () => {
    saveSst('frades', 29.54);
    expect(getSavedSst('frades')).toBe(29.5);
    expect(getSavedSst('barra')).toBeNull();
    expect(getSavedSstTime('frades')).not.toBeNull();

    saveSst('barra', 27.8);
    expect(getSavedSst('barra')).toBe(27.8);
    expect(getSavedSst('frades')).toBe(29.5);
  });

  it('ignora valores inválidos (NaN / infinito)', () => {
    saveSst('frades', Number.NaN);
    expect(getSavedSst('frades')).toBeNull();
    saveSst('frades', Number.POSITIVE_INFINITY);
    expect(getSavedSst('frades')).toBeNull();
  });

  it('limpa somente as chaves do Kirimurê sem apagar dados de outras aplicações', () => {
    const entries = new Map<string, string>([
      ['kirimure_saved_sst_frades', '28.4'],
      ['kirimure_saved_sst_time_frades', '2026-11-08T00:00:00.000Z'],
      ['preferencia_acessibilidade', 'alto-contraste'],
    ]);
    const storage = {
      get length() {
        return entries.size;
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
      clear: vi.fn(() => entries.clear()),
    };
    vi.stubGlobal('localStorage', storage);

    clearSavedStorage();

    expect(entries.has('kirimure_saved_sst_frades')).toBe(false);
    expect(entries.has('kirimure_saved_sst_time_frades')).toBe(false);
    expect(entries.get('preferencia_acessibilidade')).toBe('alto-contraste');
    expect(storage.clear).not.toHaveBeenCalled();
  });
});
