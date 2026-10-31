import { describe, expect, it, beforeEach } from 'vitest';
import { getSavedSst, saveSst, getSavedSstTime, clearSavedStorage } from './oceanStorage';

describe('oceanStorage', () => {
  beforeEach(() => {
    clearSavedStorage();
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
});
