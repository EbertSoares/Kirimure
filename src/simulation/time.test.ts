import { describe, expect, it } from 'vitest';
import { formatSimulatedTime } from './time';

describe('formatação do tempo simulado', () => {
  it('respeita singular e plural', () => {
    expect(formatSimulatedTime(1)).toBe('1 dia');
    expect(formatSimulatedTime(365.25)).toBe('1 ano');
  });

  it('troca de unidade sem combiná-las', () => {
    expect(formatSimulatedTime(44)).toBe('44 dias');
    expect(formatSimulatedTime(45)).toBe('1,5 meses');
    expect(formatSimulatedTime(364)).toBe('12 meses');
  });
});
