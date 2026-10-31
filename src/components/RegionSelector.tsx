import { useCallback, useEffect, useRef } from 'react';
import type { BtsSectorDefinition, BtsSectorId } from '../simulation/types';
import { Icon } from './Icons';

interface RegionSelectorProps {
  sectors: readonly BtsSectorDefinition[];
  selectedSectorId: BtsSectorId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSector: (sectorId: BtsSectorId) => void;
}

export function RegionSelector({
  sectors,
  selectedSectorId,
  open,
  onOpenChange,
  onSelectSector,
}: RegionSelectorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const selectedSector = sectors.find((sector) => sector.id === selectedSectorId) ?? sectors[0];

  const closeAndReturnFocus = useCallback(() => {
    onOpenChange(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        onOpenChange(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeAndReturnFocus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, onOpenChange, closeAndReturnFocus]);

  return (
    <div className={`region-selector ${open ? 'is-open' : ''}`} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`region-trigger ${open ? 'is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Baía de Todos-os-Santos, ${selectedSector.label}. Escolher região`}
        title="Escolher região"
        onClick={() => onOpenChange(!open)}
      >
        <Icon name="location" className="region-trigger__pin" />
        <span className="region-trigger__text">
          <span className="region-trigger__kicker">Baía de Todos-os-Santos</span>
          <span className="region-trigger__name">{selectedSector.label}</span>
        </span>
        <Icon name="chevronDown" className="region-trigger__chevron" />
      </button>

      {open && (
        <div className="region-menu" role="dialog" aria-label="Escolher região">
          <div className="region-menu__header">
            <span className="region-menu__title">Escolher região</span>
            <button
              type="button"
              className="btn btn--quiet btn--icon region-menu__close"
              onClick={closeAndReturnFocus}
              aria-label="Fechar seletor de região"
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="region-menu__list" role="listbox" aria-label="Regiões da Baía de Todos-os-Santos">
            {sectors.map((sector) => {
              const isSelected = sector.id === selectedSector.id;
              return (
                <button
                  key={sector.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`region-option ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => {
                    if (sector.id !== selectedSector.id) {
                      onSelectSector(sector.id);
                    }
                    closeAndReturnFocus();
                  }}
                >
                  <span className="region-option__body">
                    <span className="region-option__name">{sector.label}</span>
                    <span className="region-option__sub">{sector.sublabel}</span>
                  </span>
                  {isSelected && <Icon name="check" className="region-option__check" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
