import type { BtsSectorId } from '../simulation/types';

const STORAGE_KEY_PREFIX = 'kirimure_saved_sst_';
const STORAGE_TIME_PREFIX = 'kirimure_saved_sst_time_';

const memoryStore = new Map<string, string>();

function getStorageItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // Protege contra restrições de sandbox/iframe
  }
  return memoryStore.get(key) ?? null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    // Protege contra restrições de sandbox/iframe
  }
  memoryStore.set(key, value);
}

export function clearSavedStorage(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      // Preserve dados de outras aplicações e preferências que compartilhem a origem.
      const keysToRemove: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(STORAGE_KEY_PREFIX) || key?.startsWith(STORAGE_TIME_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
  } catch {
    // Protege contra restrições de sandbox/iframe
  }
  memoryStore.clear();
}

/**
 * Recupera a última temperatura da superfície do mar (°C) salva para o setor,
 * retornada anteriormente pela API.
 */
export function getSavedSst(sectorId: BtsSectorId): number | null {
  const val = getStorageItem(`${STORAGE_KEY_PREFIX}${sectorId}`);
  if (!val) return null;
  const num = parseFloat(val);
  return Number.isFinite(num) ? num : null;
}

/**
 * Salva a temperatura da superfície do mar retornada pela API para persistência
 * em caso de falhas futuras da rede ou recarregamento da página.
 */
export function saveSst(sectorId: BtsSectorId, sst: number): void {
  if (!Number.isFinite(sst)) return;
  setStorageItem(`${STORAGE_KEY_PREFIX}${sectorId}`, sst.toFixed(1));
  setStorageItem(`${STORAGE_TIME_PREFIX}${sectorId}`, new Date().toISOString());
}

/**
 * Retorna a data/hora UTC em formato ISO em que o último dado da API foi salvo.
 */
export function getSavedSstTime(sectorId: BtsSectorId): string | null {
  return getStorageItem(`${STORAGE_TIME_PREFIX}${sectorId}`);
}
