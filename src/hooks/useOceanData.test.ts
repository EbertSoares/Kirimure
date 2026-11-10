import { describe, expect, it } from 'vitest';
import {
  OCEAN_CACHE_TTL_MS,
  isOceanCacheFresh,
  mergeSectorCacheOnFailure,
  type SectorOceanCache,
} from './useOceanData';

function makeStatus(state: 'success' | 'error') {
  return {
    state,
    lastAttemptUtc: null,
    lastSuccessUtc: null,
    error: state === 'error' ? 'falha simulada' : null,
    isFallback: false,
  };
}

function makeCache(fetchedAtMs: number): SectorOceanCache {
  return {
    crwData: [],
    meteoData: [],
    noaaStatus: makeStatus('success'),
    meteoStatus: makeStatus('success'),
    lastUpdated: new Date(fetchedAtMs),
    fetchedAtMs,
  };
}

describe('Cache de dados oceanográficos', () => {
  it('reaproveita somente cache dentro do TTL', () => {
    const now = 1_000_000;
    expect(isOceanCacheFresh(undefined, now)).toBe(false);
    expect(isOceanCacheFresh(makeCache(now - 1000), now)).toBe(true);
    expect(isOceanCacheFresh(makeCache(now - OCEAN_CACHE_TTL_MS + 1), now)).toBe(true);
    expect(isOceanCacheFresh(makeCache(now - OCEAN_CACHE_TTL_MS), now)).toBe(false);
  });

  it('não grava falha de rede como cache vazio válido', () => {
    const failure = { noaaStatus: makeStatus('error') };
    expect(mergeSectorCacheOnFailure(undefined, failure)).toBeNull();

    const fresh = makeCache(123_456);
    const merged = mergeSectorCacheOnFailure(fresh, failure);

    expect(merged).not.toBeNull();
    // A idade do último sucesso é preservada: a falha não renova o TTL.
    expect(merged?.fetchedAtMs).toBe(fresh.fetchedAtMs);
    expect(merged?.noaaStatus.state).toBe('error');
    expect(merged?.crwData).toEqual(fresh.crwData);
  });
});
