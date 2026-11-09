# PROJETO KIRIMURÊ — AUDITORIA TÉCNICA, MATRIZ DE COMPARAÇÃO OPEN-SOURCE E ARQUITETURA DE RECONSTRUÇÃO (EXPERIMENTAL ULTRA)

## 1. Diagnóstico Técnico da Implementação Anterior

A auditoria completa do pipeline de renderização e física em [`src/scene/babylon/`](file:///Users/ebertsoares/Documents/Kirimure-main/src/scene/babylon) revelou **18 limitações estruturais** que impediam o realismo físico e óptico exigido para o Kirimurê:

### 1.1. Geometria e Matemática das Ondas (`waves.ts` e `water.ts`)
1. **Violação do Limite de Nyquist e Ondas Triangulares/Pontudas**:
   - A malha `superficie-oceano-gerstner` (`HALF_WIDTH = 620`, `Z_START = 21.5`, `Z_END = 555`) aplicava uma distribuição exponencial `pow(s, 1.55)` com apenas 96–128 colunas para cobrir 1.240 metros de largura.
   - No plano frontal (`Z = 21.5 m`), o espaçamento entre vértices era de `0.6 m a 1.4 m`, enquanto `waves.ts` injetava ondas Gerstner curtas de comprimento $\lambda = 1.22\text{ m}, 1.68\text{ m}, 2.35\text{ m}$ com alta *choppiness* (`0.56`).
   - Como $\lambda < 2 \Delta x$, cada crista curta acertava um único vértice isolado, produzindo **silhuetas triangulares, pontudas e facetadas** em vez de cristas oceânicas arredondadas.
2. **Ausência de Síntese Espectral FFT Multicascata**:
   - Uma soma fixa de 10 senoides de Gerstner carece da densidade espectral contínua de um espectro direcional de Phillips/JONSWAP ($N \times N$ modos de onda em múltiplas cascatas incomensuráveis).
3. **Corte Frontal (`frente-onda-corte`) Artificial**:
   - A fita de menisco frontal tinha `0.64 m` a `1.0 m` de espessura vertical quase opaca (`alpha = 0.88`), criando uma faixa ciano/branca rígida no meio da tela em vez de uma interface óptica ar-água fina e orgânica.

### 1.2. Óptica Aquática e Espuma (`water.ts`)
4. **Fresnel Simplificado e Sem Janela de Snell Subaquática**:
   - Faltava a transição física entre reflexão especular rasante ($F(\theta) \to 1$) e transmissão vertical ($F_0 = 0.02$), bem como reflexão interna total ($\theta_c = 48.6^\circ$) quando observada por baixo.
5. **Ausência de Microfacetas GGX de Duplo Lóbulo e Ondas Capilares de Vento**:
   - O brilho solar usava Phong simples (`pow(nh, 260)`), sem distribuição microfacetada GGX nem banco de 14 trens de ondas capilares com rajadas (*cat's-paws*).
6. **Absorção Espectral de Beer–Lambert Incompleta**:
   - A cor da água era interpolada por distância linear (`smoothstep`) em vez de seguir a lei física $T(\lambda, d) = \exp(-\sigma(\lambda) \cdot d)$ com atenuação diferencial para vermelho ($\sigma_R \gg \sigma_G > \sigma_B$) e espalhamento múltiplo (*in-scattering*).
7. **Espuma Sem Advecção de Renda Filamento (`foamLace`) nem Esteira de Kelvin**:
   - A espuma dependia apenas de uma textura estática repetida, sem advecção por vórtice (*curl noise*), sem persistência temporal de quebra e sem esteira em V de Kelvin acoplada ao casco do barco.

### 1.3. Física Naval e Hidrodinâmica (`boat.ts`)
8. **Aproximação Cinemática por Molas Desacopladas**:
   - O barco usava 5 sondas pontuais e molas escalares independentes para *heave*, *pitch* e *roll*, somadas a senoides de tempo (`Math.sin(seconds * 0.42)`), sem integração de corpo rígido 6-DOF, sem tensor de inércia $(I_{xx}, I_{yy}, I_{zz})$, sem centro de massa/centro de empuxo e sem empuxo volumétrico de Arquimedes ($F_b = \rho g V_{\text{sub}}$).

### 1.4. Ambiente Subaquático, Horizonte e IA de Peixes (`terrain.ts`, `effects.ts`, `sky.ts`, `FishSystem.ts`)
9. **Raios Volumétricos Rígidos**: Planos aditivos sem acoplamento com o ângulo refratado de Snell nem convergência de inclinação das ondas (`jacobian`).
10. **Falta de Oclusão de Contato no Leito Arenoso**: Rochas e corais apoiados na areia sem sombra de contato local.
11. **Ilhas do Horizonte com Aparência de Recorte**: Malhas de poucos segmentos verticais sem extrusão 3D de relevo, sem separação geológica por declividade (areia costeira, escarpa rochosa, dossel de Mata Atlântica) e sem extinção atmosférica física de Rayleigh/Mie.
12. **Vizinhança de Peixes $O(N^2)$ Sem Spatial Hash 3D nem Campo de Visão (FOV)**:
    - A busca de vizinhos comparava todos os pares ($O(N^2)$), sem ponderação de campo visual ($290^\circ$), sem campo de corrente marinha 3D separado da velocidade orbital e sem desvio tridimensional real do casco submerso do barco.

---

## 2. Matriz de Comparação de Projetos Open-Source de Referência

| Critério Técnico | **WebTide** (`BarthPaleologue/WebTide`) | **OceanDemo** (`Popov72/OceanDemo`) | **Abyssal** (`stanleyuka20-ctrl/ocean`) | **Web-Ocean / Deepsea** (`noniv/web-ocean`) | **Babylon.js `WaterMaterial`** | **Nova Arquitetura Kirimurê (Ultra)** |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Síntese de Ondas** | FFT Espectral (Tessendorf / JONSWAP) + cascata multi-resolução | FFT Espectral 3 cascatas em WebGPU Compute Shaders (Babylon.js) | FFT Espectral Híbrida + Gerstner adaptativo | **FFT Espectral 3 cascatas incomensuráveis (`512m, 97m, 17.7m`) + 14 capilares** | Senoide simples no vertex shader | **FFT Espectral 3 cascatas incomensuráveis + suavização bicúbica Hermite + filtro de Nyquist + 14 ondas capilares** |
| **Geometria & Silhueta** | Malha projetada / CDLOD | Grade projetada em espaço de câmera | Anéis concêntricos adaptativos | **Malha radial adaptativa com atenuação de Nyquist por espaçamento de vértice** | Plano uniforme de baixa densidade | **Malha adaptativa de alta densidade (`240×168`) + filtro de Nyquist + interpolação bicúbica (ondas 100% arredondadas)** |
| **Óptica Superficial** | Fresnel Schlick + absorção por profundidade | Fresnel + skybox IBL + espuma | PBR + refração planar + SSS | **Fresnel exato ($n=1.333$) + GGX duplo lóbulo + Beer–Lambert RGB + `ambientInscatter`** | Reflexão/refração RTT básica + Phong | **Fresnel dielétrico exato + GGX duplo lóbulo + Beer–Lambert RGB + SSS de crista + RTT Reflexão/Refração** |
| **Espuma (Whitecaps)** | Jacobiano $J < J_{\text{crit}}$ | Jacobiano + textura de espuma | Energia de crista + mapa celular | **Jacobiano $J$ + `foamLace` advectado por curl + pluma submersa turquesa** | Nenhuma nativa | **Jacobiano FFT + colisão de grupos + `foamLace` advectado por curl + esteira Kelvin do barco** |
| **Física de Flutuação** | Amostragem de altura simples | Boias cinemáticas | Sondas de altura | Amostragem analítica | Nenhuma nativa | **Solver 6-DOF de Arquimedes com 18 painéis volumétricos de casco, tensor de inércia, arrasto quadrático e substepping fixo (`120 Hz`)** |
| **Ambiente Subaquático** | Básico (foco aéreo) | Foco aéreo | Foco aéreo | **Feixes volumétricos + cáusticas de Hoskins 4 iterações + extinção Beer–Lambert + ondulações assimétricas de areia** | Sem suporte subaquático | **Split-level com janela de Snell + feixes volumétricos Henyey–Greenstein + cáusticas duplas + AO de contato no recife** |

---

## 3. Arquitetura Proposta e Estratégia de Integração Babylon.js + WebGPU/WebGL2

### 3.1. `OceanSurfaceProvider` Unificado (`src/scene/babylon/oceanFft.ts` + `src/scene/babylon/waves.ts`)
- Implementa o sintetizador espectral de **Jerry Tessendorf (JONSWAP + Phillips direcional)** em 3 cascatas incomensuráveis (`L = [168.0, 37.0, 8.3]` metros) com dispersão $\omega(k) = \sqrt{gk(1 + k^2/k_m^2)\tanh(kH)}$ e transformada rápida de Fourier inversa 2D radix-2 (`Cooley–Tukey IFFT`) em buffers `Float32Array` pré-alocados (zero GC por frame).
- **Inversão Lagrangiana de Deslocamento Horizontal**:
  - Como o deslocamento choppiness move uma partícula de $\mathbf{x}_0$ para $\mathbf{x} = \mathbf{x}_0 + \mathbf{D}(\mathbf{x}_0, t)$, a função `sampleSurface(x, z, time)` executa 4 iterações de ponto fixo $\mathbf{x}_0^{(k+1)} = \mathbf{x} - \mathbf{D}(\mathbf{x}_0^{(k)}, t)$ com **interpolação bicúbica de Hermite** e **band-limiting de Nyquist** por espaçamento de malha.
  - Isso garante **sincronia matemática 100% exata e latência zero (`mapAsync = 0`)** entre a malha renderizada na GPU, a linha frontal de menisco e as 18 células volumétricas do casco do barco 6-DOF.

### 3.2. Solver Hidrodinâmico 6-DOF de Arquimedes (`src/scene/babylon/boat.ts`)
- Discretiza o casco em **18 elementos volumétricos 3D** distribuídos ao longo da quilha, bojo (*chine*) e costado (proa, meia-nau e popa, bombordo e estibordo).
- A cada substep fixo ($\Delta t = 1/120\text{ s}$):
  1. Transforma cada painel $i$ para coordenadas de mundo e consulta `sampleOcean(px, pz, t)`.
  2. Calcula a fração submersa $f_i \in [0, 1]$, o volume deslocado $V_i = f_i \Delta V_i$ e a força de Arquimedes $\mathbf{F}_{b,i} = \rho g V_i \hat{\mathbf{y}}$ + pressão hidrodinâmica normal da onda.
  3. Calcula a velocidade relativa de cada painel em relação à velocidade orbital da água $\mathbf{u}_i = \mathbf{v}_i - \mathbf{v}_{\text{wave}}$ e aplica arrasto linear e quadrático anisotrópico.
  4. Acumula forças $\sum \mathbf{F}_i$ e torques $\boldsymbol{\tau} = \sum (\mathbf{p}_i - \mathbf{x}_{\text{CM}}) \times \mathbf{F}_i$ em torno do centro de massa, integrando posição linear e orientação por quatérnion com massa adicional hidrodinâmica e momento restaurador metacêntrico ($GM > 0$).
