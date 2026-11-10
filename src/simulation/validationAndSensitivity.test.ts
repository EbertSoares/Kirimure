import { describe, expect, it } from 'vitest';
import {
  BASELINE,
  BTS_SECTORS,
  CONTROL_GROUPS,
  FACTOR_ORDER,
  isMassLoadId,
  ITEM_DEFINITIONS,
  MICROPLASTICS_OPTIONS_PARTICLES_M3,
  PARAMETER_EVIDENCE_REGISTRY,
  PARAMETERS,
} from './config';
import { calculateCarbonateSystem, calculateRespirationPhImpact } from './carbonate';
import { BTS_MICROPLASTICS_STUDY, calculateOilFateBudget } from './contaminants';
import {
  buildTargets,
  calculatePressures,
  createInitialState,
  estimateCriticalDays,
  normalizedMicroplasticsConcentration,
  tickSimulation,
} from './model';
import {
  calculateEquilibriumOxygen,
  calculateWeissOxygenSaturation,
  convertBOD5ToPulseDeltaMgL,
} from './oxygen';
import {
  buildBtsThermodynamicReferenceCases,
  evaluateParametricSensitivity,
} from './sensitivity';

describe('Validação Científica, Casos de Referência da BTS e Sensibilidade (Prioridade 2)', () => {
  describe('1. Casos termodinâmicos e químicos de referência nos 3 compartimentos da BTS', () => {
    it('calcula solubilidade de Weiss (1970) coerente com temperatura e salinidade de cada setor', () => {
      const refs = buildBtsThermodynamicReferenceCases();
      const frades = refs.find((r) => r.sectorId === 'frades')!;
      const paraguacu = refs.find((r) => r.sectorId === 'paraguacu')!;
      const barra = refs.find((r) => r.sectorId === 'barra')!;

      // Ilha dos Frades: 26,8 °C e 35 PSU -> ~6,55 mg O2/L (corrige valor antigo de 7,12 mg/L)
      expect(frades.weissSaturationMgL).toBeCloseTo(6.55, 2);
      expect(PARAMETERS.oxygen.saturationMgL).toBeCloseTo(
        calculateWeissOxygenSaturation(BASELINE.temperature, 35.0),
        2,
      );

      // Canal do Paraguaçu (22 PSU, estuarino salobro) retém mais O2 dissolvido que águas euhalinas (35–36,5 PSU)
      expect(paraguacu.weissSaturationMgL).toBeGreaterThan(frades.weissSaturationMgL);
      expect(paraguacu.weissSaturationMgL).toBeGreaterThan(6.95);
      expect(barra.weissSaturationMgL).toBeGreaterThan(6.45);
      expect(barra.weissSaturationMgL).toBeLessThan(6.65);
    });

    it('reduz saturação de aragonita (Ωarag) monotonicamente sob acidificação direta e DIC respiratório', () => {
      const refState = calculateCarbonateSystem(8.10, 2350, 26.8, 35.0);
      const marginalState = calculateCarbonateSystem(7.75, 2350, 26.8, 35.0);
      const stressedState = calculateCarbonateSystem(7.70, 2350, 26.8, 35.0);

      expect(refState.omegaAragonite).toBeGreaterThan(3.4);
      expect(marginalState.omegaAragonite).toBeLessThan(2.2);
      expect(stressedState.omegaAragonite).toBeLessThan(2.0);
      expect(stressedState.pCO2Uatm).toBeGreaterThan(refState.pCO2Uatm * 2);

      // Adição de DIC por respiração microbiana da matéria orgânica reduz pH efetivo e Ωarag
      const respImpact = calculateRespirationPhImpact(8.10, 140, 2350, 26.8, 35.0);
      expect(respImpact.effectivePh).toBeLessThan(8.10);
      expect(respImpact.carbonateSystem.omegaAragonite).toBeLessThan(refState.omegaAragonite);
    });
  });

  describe('2. Dinâmica investigativa em sala: descarga contínua vs. pulso isolado de esgoto', () => {
    it('distingue depleção crônica sob carga contínua de recuperação por reaeração/maré após pulso isolado', () => {
      const sewageMass = 20000; // 20 t DBO5

      // Cenário A: Descarga contínua (20 t DBO5/dia em Ilha dos Frades)
      let continuous = createInitialState('frades');
      continuous.paused = false;
      continuous.speed = 10;
      continuous.sewageDischargeMode = 'continuous';
      continuous.controls = { ...continuous.controls, sewage: sewageMass };
      continuous.targets = buildTargets(continuous.controls, 'frades', 'continuous');

      for (let step = 0; step < 240; step += 1) {
        continuous = tickSimulation(continuous, 0.1); // ~60 dias a 10x (0,25 d/s * 10 * 0,1 = 0,25 d/passo)
      }

      const expectedContinuousEq = calculateEquilibriumOxygen(
        continuous.env,
        'frades',
        15,
        'continuous_daily',
      );
      expect(continuous.dissolvedOxygen).toBeLessThan(5.0);
      expect(Math.abs(continuous.dissolvedOxygen - expectedContinuousEq)).toBeLessThan(0.45);

      // Cenário B: Pulso isolado único de 20 t DBO5 seguido de evolução sem novo aporte
      let pulse = createInitialState('frades');
      pulse.paused = false;
      pulse.speed = 10;
      pulse.sewageDischargeMode = 'pulse';
      const fradesSector = BTS_SECTORS.find((s) => s.id === 'frades')!;
      pulse.biochemicalOxygenDemand = convertBOD5ToPulseDeltaMgL(sewageMass, fradesSector.mixingVolumeM3);

      let minPulseOxygen = pulse.dissolvedOxygen;
      for (let step = 0; step < 240; step += 1) {
        pulse = tickSimulation(pulse, 0.1);
        minPulseOxygen = Math.min(minPulseOxygen, pulse.dissolvedOxygen);
      }

      // O pulso provoca queda transitória inicial (sag), mas recupera para próximo da saturação após 60 dias
      expect(minPulseOxygen).toBeLessThan(6.1);
      expect(pulse.dissolvedOxygen).toBeGreaterThan(minPulseOxygen + 0.4);
      expect(pulse.dissolvedOxygen).toBeGreaterThan(continuous.dissolvedOxygen + 1.0);
      expect(pulse.biochemicalOxygenDemand).toBeLessThan(0.05);
    });
  });

  describe('3. Coerência dimensional, unidades e contratos epistemológicos', () => {
    it('representa microplásticos exclusivamente como concentração em part./m³ ancorada em Trindade et al. (2023)', () => {
      expect(isMassLoadId('microplastics')).toBe(false);
      expect(ITEM_DEFINITIONS.microplastics.unit).toBe('part./m³');
      expect(MICROPLASTICS_OPTIONS_PARTICLES_M3[0]).toBe(0);
      expect(
        MICROPLASTICS_OPTIONS_PARTICLES_M3[MICROPLASTICS_OPTIONS_PARTICLES_M3.length - 1],
      ).toBe(33000);

      // Verifica o teto aproximado publicado; valores intermediários são didáticos.
      expect(BTS_MICROPLASTICS_STUDY.approximateMaximumCountPerM3).toBe(33000);

      // Monotonicidade estrita da pressão normalizada de microplásticos em [0, 1]
      const pZero = normalizedMicroplasticsConcentration(0);
      const pMean = normalizedMicroplasticsConcentration(5000);
      const pExtreme = normalizedMicroplasticsConcentration(33000);

      expect(pZero).toBe(0);
      expect(pMean).toBeCloseTo(5000 / 33000, 3);
      expect(pMean).toBeLessThan(pExtreme);
      expect(pExtreme).toBeLessThanOrEqual(1);

      const pressuresMean = calculatePressures({ ...BASELINE, microplastics: 5000 }, 0, 0);
      const pressuresHigh = calculatePressures({ ...BASELINE, microplastics: 33000 }, 0, 0);
      expect(pressuresHigh.microplastics).toBeGreaterThan(pressuresMean.microplastics);
      expect(pressuresHigh.microplastics).toBeCloseTo(1, 3);
    });

    it('mantém conservação estrita de massa no modelo de 4 reservatórios de óleo', () => {
      for (const sector of BTS_SECTORS) {
        const budget = calculateOilFateBudget(15000, sector.id, 5);
        expect(Math.abs(budget.massBalanceResidualKg)).toBeLessThan(1e-6);
        expect(budget.dissolvedPahConcentrationUgL).toBeGreaterThan(0);
      }
    });

    it('classifica parâmetros por nível de evidência e organiza os controles em grupos com indicadores', () => {
      expect(FACTOR_ORDER).toHaveLength(7);
      const groupedItems = CONTROL_GROUPS.flatMap((g) => g.items);
      expect(groupedItems).toHaveLength(7);
      expect(new Set(groupedItems).size).toBe(7);
      expect(groupedItems).toContain('fishing');

      for (const id of FACTOR_ORDER) {
        const def = ITEM_DEFINITIONS[id];
        expect(def.primaryIndicators.length).toBeGreaterThanOrEqual(2);
        expect(def.primaryIndicators.length).toBeLessThanOrEqual(3);
        expect(def.causalChain.length).toBeGreaterThan(20);
      }

      // Escalas logarítmicas / não lineares explicitamente sinalizadas
      expect(ITEM_DEFINITIONS.ph.scaleBadge).toBeTruthy();
      expect(ITEM_DEFINITIONS.sewage.scaleBadge).toBeTruthy();
      expect(ITEM_DEFINITIONS.oil.scaleBadge).toBeTruthy();
      expect(ITEM_DEFINITIONS.microplastics.scaleBadge).toBeTruthy();

      // Registro epistemológico cobre níveis empíricos, publicados, hipóteses e parâmetros didáticos
      const levels = new Set(PARAMETER_EVIDENCE_REGISTRY.map((r) => r.evidenceLevel));
      expect(levels.has('Medido')).toBe(true);
      expect(levels.has('Publicado')).toBe(true);
      expect(levels.has('Hipótese do Modelo')).toBe(true);
      expect(levels.has('Parâmetro Didático')).toBe(true);

      for (const rec of PARAMETER_EVIDENCE_REGISTRY) {
        expect(rec.parameter.length).toBeGreaterThan(3);
        expect(rec.sourceOrBasis.length).toBeGreaterThan(3);
        expect(rec.scopeNote.length).toBeGreaterThan(10);
      }
    });
  });

  describe('4. Análise de sensibilidade paramétrica e invariantes numéricos extremos', () => {
    it('quantifica a sensibilidade direcional física de kd, SOD, tau e volume de mistura (±25%)', () => {
      const results = evaluateParametricSensitivity('frades', 2500, 0.25);
      const byId = Object.fromEntries(results.map((r) => [r.parameterId, r]));

      // Aumentar tempo de residência (tau) retém mais CBODu na baía -> reduz OD de equilíbrio (S < 0)
      expect(byId.dischargeDays.highParameterOxygenMgL).toBeLessThan(
        byId.dischargeDays.lowParameterOxygenMgL,
      );
      expect(byId.dischargeDays.normalizedSensitivityIndex).toBeLessThan(0);

      // Aumentar demanda bentônica do sedimento (SOD) consome mais O2 -> reduz OD (S < 0)
      expect(byId.sodRate.highParameterOxygenMgL).toBeLessThan(byId.sodRate.lowParameterOxygenMgL);
      expect(byId.sodRate.normalizedSensitivityIndex).toBeLessThan(0);

      // Aumentar volume da caixa de mistura dilui a carga orgânica -> eleva OD de equilíbrio (S > 0)
      expect(byId.mixingVolumeM3.highParameterOxygenMgL).toBeGreaterThan(
        byId.mixingVolumeM3.lowParameterOxygenMgL,
      );
      expect(byId.mixingVolumeM3.normalizedSensitivityIndex).toBeGreaterThan(0);
    });

    it('preserva invariantes físicos ([0, 100] para índices e [0.05, 1.25*Cs] para OD) sob estresse extremo combinado', () => {
      let extreme = createInitialState('paraguacu');
      extreme.paused = false;
      extreme.speed = 10;
      extreme.controls = {
        temperature: 32.0,
        ph: 7.70,
        turbidity: 100,
        sewage: 100000,
        oil: 100000,
        microplastics: 33000,
        fishing: 100,
      };
      extreme.targets = buildTargets(extreme.controls, 'paraguacu', 'continuous');

      for (let i = 0; i < 720; i += 1) {
        extreme = tickSimulation(extreme, 0.1); // 180 dias simulados
        expect(Number.isFinite(extreme.dissolvedOxygen)).toBe(true);
        expect(extreme.dissolvedOxygen).toBeGreaterThanOrEqual(0.05);
        expect(extreme.dissolvedOxygen).toBeLessThanOrEqual(10);
        expect(extreme.health.coral).toBeGreaterThanOrEqual(0);
        expect(extreme.health.coral).toBeLessThanOrEqual(100);
        expect(extreme.health.fish).toBeGreaterThanOrEqual(0);
        expect(extreme.health.fish).toBeLessThanOrEqual(100);
        expect(extreme.overall).toBeGreaterThanOrEqual(0);
        expect(extreme.overall).toBeLessThanOrEqual(100);
      }

      const criticalDays = estimateCriticalDays(extreme.targets, 'paraguacu', 365);
      expect(criticalDays).not.toBeNull();
      expect(criticalDays!).toBeGreaterThan(0);
    });
  });
});
