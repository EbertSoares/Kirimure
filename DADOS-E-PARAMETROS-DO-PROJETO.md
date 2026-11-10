# Laboratório Digital Marinho Kirimurê
## Caderno Consolidado de Dados, Fórmulas, Parâmetros, Proveniência e Nível de Evidência

Este documento registra os dados externos, equações matemáticas, constantes cinéticas, formulações ecológicas, ordem operacional de consulta às APIs e a **classificação explícita do nível de evidência** de cada parâmetro do **Laboratório Digital Marinho Kirimurê** (Baía de Todos-os-Santos, Bahia).

---

## Sumário

1. [Identificação Geral e Distinção Epistemológica](#1-identificação-geral-e-distinção-epistemológica)
2. [Escala Temporal e Resolução Cinética](#2-escala-temporal-e-resolução-cinética)
3. [Compartimentação e Hidrodinâmica da Baía de Todos-os-Santos](#3-compartimentação-e-hidrodinâmica-da-baía-de-todos-os-santos)
4. [Variáveis de Entrada Agrupadas e Condições de Referência](#4-variáveis-de-entrada-agrupadas-e-condições-de-referência)
5. [Dinâmica Físico-Química do Oxigênio Dissolvido (Weiss, 1970 e Cinética DBO/OD)](#5-dinâmica-físico-química-do-oxigênio-dissolvido-weiss-1970-e-cinética-dbood)
6. [Separação entre DHW Satelital (NOAA) e Estresse Térmico Simulado](#6-separação-entre-dhw-satelital-noaa-e-estresse-térmico-simulado)
7. [Química do Sistema Carbonato Marinho e Acidificação Costeira](#7-química-do-sistema-carbonato-marinho-e-acidificação-costeira)
8. [Combinação de Estresses, Sensibilidade por Espécie e Limiar Crítico do Modelo](#8-combinação-de-estresses-sensibilidade-por-espécie-e-limiar-crítico-do-modelo)
9. [Equações de Algas, Equilíbrio Trófico e Resiliência Relativa](#9-equações-de-algas-equilíbrio-trófico-e-resiliência-relativa)
10. [Fontes Externas, Ordem Operacional de Consulta e Semântica de Dados](#10-fontes-externas-ordem-operacional-de-consulta-e-semântica-de-dados)
11. [Classificação do Nível de Evidência dos Parâmetros](#11-classificação-do-nível-de-evidência-dos-parâmetros)
12. [Geometria 3D e Correspondência Visual-Científica](#12-geometria-3d-e-correspondência-visual-científica)
13. [Referências Bibliográficas e Normativas Oficiais](#13-referências-bibliográficas-e-normativas-oficiais)

---

## 1. Identificação Geral e Distinção Epistemológica

- **Nome Oficial:** Kirimurê — Laboratório Digital Marinho
- **Ecossistema de Referência:** Recifes de franja, fundos carbonáticos e comunidades ictiológicas da Baía de Todos-os-Santos (BTS), Bahia, Brasil.
- **Espécies Representadas:** Corais construtores (*Siderastrea stellata*, *Mussismilia hispida*, *Mussismilia harttii*, *Montastraea cavernosa*) e três grupos funcionais da ictiofauna recifal (*Acanthurus*, *Abudefduf saxatilis*, *Scarus / Sparisoma*).

O sistema separa rigorosamente **três naturezas distintas de informação**:
1. **Dados derivados de observações satelitais (NOAA Coral Reef Watch 5 km):** observações indiretas processadas de temperatura superficial (SST), anomalia, HotSpot, DHW oficial e nível ordinal de alerta (`CRW_BAA`).
2. **Dados produzidos por modelos numéricos externos (Open-Meteo Marine):** estimativas horárias modeladas de ondas, correntes e nível do mar para células oceânicas adjacentes, não equivalentes a boias ou marégrafos locais no interior de canais estuarinos.
3. **Resultados calculados pela simulação local do Kirimurê:** evolução determinística de oxigênio, carbonato, pressões ambientais e índices relativos de saúde dos organismos sob cenários manipulados em sala de aula.

---

## 2. Escala Temporal e Resolução Cinética

| Parâmetro | Valor | Unidade | Classificação | Descrição / Função |
| :--- | :--- | :--- | :--- | :--- |
| `tickRate` | `10` | Hz | Arquitetura | 10 atualizações por segundo real |
| `daysPerRealSecond` (1×) | `0.5` | dias / s real | Parâmetro Didático | 1 dia simulado a cada 2 segundos reais (`0,5 dia/s` em 1×; `5 dias/s` em 10×) |
| `maxSubStepDays` | `0.05` | dias | Numérico | Passo máximo de Euler (~1,2 h) garantindo invariância entre 1× e 10× |

### Constantes de Relaxamento Cinético ($\tau_i$ em dias)

As variáveis ambientais aproximam-se gradualmente do valor-alvo ajustado pelo usuário segundo cinética de primeira ordem:

$$X(t + \Delta t) = X(t) + \left( X_{\text{alvo}} - X(t) \right) \cdot \left( 1 - e^{-\Delta t / \tau_i} \right)$$

| Grupo | Variável ($i$) | $\tau_i$ (dias) | Nível de Evidência | Papel no Modelo |
| :--- | :--- | :--- | :--- | :--- |
| **Água** | Temperatura | `2,5` | Parâmetro Didático | Inércia térmica da camada de mistura costeira |
| **Água** | pH | `12` | Parâmetro Didático | Inércia do tamponamento químico de carbonatos |
| **Água** | Turbidez | `4` | Parâmetro Didático | Suspensão e decantação gradual de partículas |
| **Poluição** | Esgoto ($\text{DBO}_5$) | `4` | Parâmetro Didático | Estabelecimento da pluma orgânica no compartimento |
| **Poluição** | Óleo / Petróleo | `3` | Parâmetro Didático | Espalhamento superficial e emulsão inicial |
| **Poluição** | Microplásticos | `5` | Parâmetro Didático | Mistura superficial das partículas na coluna d'água |
| **Ecossistema** | Pressão Pesqueira | `2` | Parâmetro Didático | Resposta rápida ao esforço de captura |

> **Nota científica:** Os valores de $\tau_i$ ordenam velocidades relativas entre processos físicos e de manejo para investigação didática; não devem ser interpretados como taxas empíricas medidas diretamente em campo.

---

## 3. Compartimentação e Hidrodinâmica da Baía de Todos-os-Santos

| Compartimento | Sub-região | Faixa $\tau_{\text{descarga}}$ | Salinidade | Temp. Base | Volume de Mistura | Nível de Evidência |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Ilha dos Frades & Itaparica** | Baía Central (Recifes) | `38 a 62 dias` | `35,0 PSU` | `26,8 °C` | $3,2 \times 10^7\text{ m}^3$ | **Publicado** ($\tau$: Cirano & Lessa, 2007) / **Hipótese do Modelo** (volume de caixa) |
| **Estuário do Paraguaçu** | Fundo da Baía / Manguezais | `60 a 90 dias` (ref. `75 d`) | `22,0 PSU` | `27,2 °C` | $1,5 \times 10^7\text{ m}^3$ | **Hipótese do Modelo** (caixa estuarina de alta retenção) |
| **Boca da Baía / Barra** | Canal de Salvador | `6 a 14 dias` (ref. `9 d`) | `36,5 PSU` | `26,4 °C` | $1,0 \times 10^8\text{ m}^3$ | **Hipótese do Modelo** (caixa oceânica de rápida renovação) |

Para contaminantes expressos como **carga lançada em massa** (`óleo` em kg), a fração retida após horizonte de $H = 30$ dias no modelo de caixa é estimada por:

$$\text{Retenção}_{\text{inverno}} = e^{-30 / \tau_{\text{mín}}}, \qquad \text{Retenção}_{\text{verão}} = e^{-30 / \tau_{\text{máx}}}, \qquad \text{Retenção}_{\text{central}} = \frac{\text{Retenção}_{\text{inverno}} + \text{Retenção}_{\text{verão}}}{2}$$

Na Baía Central (Ilha dos Frades, $\tau \in [38, 62]\text{ d}$), a retenção central em 30 dias resulta em $\approx 53,5\%$ (ou $53,4\%$ para $\tau_{\text{verão}} = 1,6 \times 38 = 60,8\text{ d}$ na constante de normalização `CENTRAL_RETENTION`).

---

## 4. Variáveis de Entrada Agrupadas e Condições de Referência

Os sete controles ambientais dividem-se em três categorias funcionais:

| Grupo | Variável | Baseline | Faixa | Escala | Unidade | Limiares (Atenção / Crítico) | Base de Referência |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Água** | Temperatura | `26,8` | `24,0 a 31,0` | Linear (`0,1`) | `°C` | `29,0` / `30,0 °C` | Branqueamento regional observado a 29–30 °C (Leão et al., 2008) |
| **Água** | pH | `8,10` | `7,70 a 8,20` | Logarítmica em $[\text{H}^+]$ | escala total | `8,00` / `7,80` | Superfície marinha tropical $\approx 8,10$ |
| **Água** | Turbidez | `0` | `0 a 100` | Linear (`1`) | `% índice` | `35%` / `70%` | Índice relativo de atenuação luminosa e sedimentação |
| **Poluição** | Esgoto ($\text{DBO}_5$) | `0` | `0 a 100.000` | Logarítmica discreta | `kg DBO₅/dia` (contínuo) ou `kg DBO₅` (pulso) | `2.000` / `20.000` | Matéria orgânica biodegradável oxidável |
| **Poluição** | Óleo / Petróleo | `0` | `0 a 100.000` | Logarítmica discreta | `kg` | `1.000` / `20.000 kg` | Toxicidade subletal de HPAs: $\text{EC}_{50} = 10\text{–}27\ \mu\text{g/L tPAH}_{50}$ (May et al., 2020) |
| **Poluição** | Microplásticos | `0` | `0 a 33.000` | Não linear discreta | `part./m³` | `5.000` / `24.000 part./m³` | Âncoras intermediárias didáticas; máximo publicado de aproximadamente `33.000 part./m³` (Trindade et al., 2023) |
| **Ecossistema** | Pressão Pesqueira | `0` | `0 a 100` | Linear (`1`) | `% índice` | `35%` / `70%` | Esforço relativo sobre ictiofauna, com maior peso sobre raspadores |

As ações de recuperação não são um slider genérico: são intervenções concretas
(tratamento de efluente, contenção de óleo, controle de erosão, área protegida e
restauração de corais) aplicadas pelo painel e avaliadas pelo modelo de intervenção.

### Escalas Discretas Não Lineares
- **Cargas de Massa (`óleo` e `esgoto`, em kg ou kg/dia):**
  `[0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]`
- **Concentração de Microplásticos (`part./m³`):**
  `[0, 100, 250, 500, 1000, 2500, 5000, 10000, 15000, 24000, 33000]`
  *(Preserva estritamente a unidade empírica de concentração superficial em partículas por metro cúbico reportada por Trindade et al., 2023, eliminando conversões arbitrárias entre massa e número de partículas).*

---

## 5. Dinâmica Físico-Química do Oxigênio Dissolvido (Weiss, 1970 e Cinética DBO/OD)

O módulo [`src/simulation/oxygen.ts`](src/simulation/oxygen.ts) resolve o balanço acoplado entre solubilidade termodinâmica, reaeração atmosférica, oxidação bacteriana da matéria orgânica, demanda bentônica do sedimento (SOD) e metabolismo líquido.

### 5.1. Solubilidade de Equilíbrio Ar-Mar (Weiss, 1970)
Para temperatura absoluta $T_K = T + 273,15$ e salinidade $S$ (PSU), o volume dissolvido em $\text{mL O}_2/\text{L}$ é dado por:

$$\ln C^* = A_1 + A_2 \left(\frac{100}{T_K}\right) + A_3 \ln\left(\frac{T_K}{100}\right) + A_4 \left(\frac{T_K}{100}\right) + S \left[ B_1 + B_2 \left(\frac{T_K}{100}\right) + B_3 \left(\frac{T_K}{100}\right)^2 \right]$$

com $A_1 = -173,4292$, $A_2 = 249,6339$, $A_3 = 143,3483$, $A_4 = -21,8492$, $B_1 = -0,033096$, $B_2 = 0,014259$, $B_3 = -0,0017$ e conversão mássica $C_s = 1,42903 \cdot e^{\ln C^*}\ [\text{mg O}_2/\text{L}]$.

Valores de saturação ($C_s$) calculados nas condições de referência de cada setor da BTS:
- **Ilha dos Frades (`26,8 °C`, `35,0 PSU`):** **`6,55 mg O₂/L`** (`PARAMETERS.oxygen.saturationMgL = 6.55`)
- **Boca da Barra (`26,4 °C`, `36,5 PSU`):** **`6,54 mg O₂/L`**
- **Estuário do Paraguaçu (`27,2 °C`, `22,0 PSU`):** **`7,18 mg O₂/L`** *(maior solubilidade devido à menor salinidade estuarina)*

### 5.2. Conversão Estequiométrica de $\text{DBO}_5$ e Equações Diferenciais Acopladas
A demanda laboratorial de 5 dias ($\text{DBO}_5$ a $20\text{ °C}$, com $k_{d,20} = 0,12\text{ d}^{-1}$) é convertida para Demanda Bioquímica Última Carbonácea ($\text{CBOD}_u$):

$$\text{CBOD}_u = \frac{\text{DBO}_5}{1 - e^{-5 \cdot k_{d,20}}} \approx 2,216 \cdot \text{DBO}_5$$

As taxas cinéticas ajustadas por temperatura (Arrhenius) e vento/profundidade ($w$ em m/s, $H$ em m) são:

$$k_d(T) = 0,12 \cdot (1,047)^{(T - 20)}, \qquad k_a(w, H, T) = \max\left(0,05,\ \frac{0,728\sqrt{w} - 0,317w + 0,0372w^2}{H} \cdot (1,024)^{(T - 20)}\right)$$

O sistema diferencial integrado a cada sub-passo $\Delta t$ para $[\text{B}] = [\text{CBOD}_u]$ e $[\text{OD}]$ é:

$$\frac{d[\text{B}]}{dt} = L_{\text{entrada}} - \left(k_d + \frac{1}{\tau_{\text{descarga}}}\right)[\text{B}]$$

$$\frac{d[\text{OD}]}{dt} = k_a \left(C_s - [\text{OD}]\right) - k_d [\text{B}] - \frac{\text{SOD}}{H} + (P - R)$$

com $\text{SOD} = 0,5\text{ g O}_2\cdot\text{m}^{-2}\cdot\text{d}^{-1}$, fotossíntese $P = 0,5(1 - \text{bloqueio óptico por turbidez e óleo})$, respiração $R = 0,35 + 0,40 \cdot (\text{Algas}/100)$ e piso numérico termodinâmico de `0,05 mg/L`.

### 5.3. Faixas Normativas e Estresse de Hipóxia (CONAMA 357 / US EPA)
- **$\ge 5,0\text{ mg/L}$:** Normóxia / Condição adequada para águas salinas Classe 1 (`estresse = 0,00`)
- **$3,0\text{ a }5,0\text{ mg/L}$:** Estresse respiratório potencial (`0,00 a 0,35`)
- **$2,0\text{ a }3,0\text{ mg/L}$:** Hipóxia (`0,35 a 0,75`)
- **$< 2,0\text{ mg/L}$:** Hipóxia severa / risco agudo de asfixia (`0,75 a 1,00`)

---

## 6. Separação entre DHW Satelital (NOAA) e Estresse Térmico Simulado

O Kirimurê mantém **dois indicadores térmicos conceitualmente distintos**, que nunca devem ser apresentados como equivalentes:

1. **DHW Satelital da NOAA (`ThermalForcingPoint.degreeHeatingWeeks`):**
   - Produto observacional externo importado do **NOAA Coral Reef Watch (grade 5 km)**.
   - Calculado pela NOAA comparando a SST de satélite com a **climatologia oficial de Temperatura Máxima Mensal (MMM) específica de cada célula** (por exemplo, $\text{MMM} = 27,92\text{ °C}$ e limiar $28,92\text{ °C}$ na estação virtual regional `todos_os_santos`).
2. **Estresse Térmico Acumulado Simulado (`SimulationState.degreeHeatingWeeks`):**
   - Resultado interno do modelo local quando o estudante manipula a temperatura no experimento.
   - Utiliza uma **referência didática fixa** ($\text{MMM}_{\text{didática}} = 28,0\text{ °C}$ e limiar de acúmulo em $29,0\text{ °C}$), integrando anomalias $\ge 1,0\text{ °C}$ acima da $\text{MMM}_{\text{didática}}$ em janela móvel de 84 dias:
     $$\text{Graus-Dia}_i = \begin{cases} (T_i - 28,0) \cdot \Delta t_i, & \text{se } T_i \ge 29,0\text{ °C} \\ 0, & \text{se } T_i < 29,0\text{ °C} \end{cases}, \qquad \text{Estresse Acumulado} = \frac{1}{7}\sum_{84\text{ d}} \text{Graus-Dia}_i\ [\text{°C-sem.}]$$

---

## 7. Química do Sistema Carbonato Marinho e Acidificação Costeira

O módulo [`src/simulation/carbonate.ts`](src/simulation/carbonate.ts) resolve o equilíbrio termodinâmico do carbono inorgânico dissolvido ($\text{DIC}$) a partir do pH (escala total), alcalinidade total escalada pela salinidade ($\text{TA} = 2350 \cdot S / 35\ \mu\text{mol/kg}$), constantes de dissociação $K_1, K_2$ de **Lueker et al. (2000)**, constante de Henry $K_0$ de **Weiss (1974)** e produtos de solubilidade $K'_{sp}$ de aragonita e calcita de **Mucci (1983)**:

$$\Omega_{\text{arag}} = \frac{[\text{Ca}^{2+}][\text{CO}_3^{2-}]}{K'_{sp,\text{arag}}}$$

Quando há oxidação bacteriana de esgoto ($\text{DBO}$), o fluxo respiratório microbiano integrado adiciona carbono inorgânico dissolvido ($\Delta\text{DIC}$, assumindo quociente respiratório $RQ = 1,0\text{ mol CO}_2/\text{mol O}_2$), e o método de bisseção determina o **pH efetivo** resultante na água costeira. Óleo e microplásticos não alteram diretamente o pH neste modelo.

---

## 8. Combinação de Estresses, Sensibilidade por Espécie e Limiar Crítico do Modelo

### 8.1. Combinação Multiplicativa Independente
Para evitar somas lineares que ultrapassem o domínio $[0, 1]$, o modelo combina pressões normalizadas $S_i \in [0, 1]$ por ação independente:

$$S_{\text{combinado}} = 1 - \prod_i (1 - S_i)$$

Nos corais, aplica-se ainda um termo de sinergia térmico-poluente ($S_{\text{sinergia}} = 0,50$):

$$S_{\text{coral}} = \text{clamp}\left( S_{\text{base}} \cdot \left[ 1 + 0,50 \cdot \min\left(P_{\text{térmico}}, \max_{j \in \text{poluentes}} W_j P_j\right) \right],\ 0,\ 1 \right)$$

### 8.2. Pesos e Sensibilidades (Parâmetros Didáticos / Hipóteses do Modelo)
- **Pesos nos corais ($W_{\text{coral}}$):** óleo `0,75`, turbidez `0,60`, esgoto `0,55`, pesca `0,30`, microplásticos `0,14` (`collapseDays = 75 d`).
- **Pesos de base na ictiofauna ($W_{\text{peixe}}$):** pesca `0,85`, óleo `0,55`, esgoto `0,40` (acoplado à hipóxia), microplásticos `0,35`, turbidez `0,35`.
- **Multiplicadores por grupo funcional de peixes:**
  - *Peixe-cirurgião (`Acanthurus`, `collapseDays = 36 d`):* calor `1,20`, turbidez `1,30`, acidez `1,10`, pesca `0,70`.
  - *Sargentinho (`Abudefduf saxatilis`, `collapseDays = 48 d`):* microplásticos `1,25`, esgoto/hipóxia `1,25`, óleo `1,10`, calor `0,85`.
  - *Peixe-papagaio (`Scarus / Sparisoma`, `collapseDays = 28 d`):* pesca `1,60`, acidez `1,20`, calor `1,05`, esgoto `1,05`.

### 8.3. Tempo Estimado até o Limiar Crítico do Modelo (`estimateCriticalDays`)
A função `estimateCriticalDays()` projeta em quantos dias simulados o índice agregado cruzaria o patamar interno $\le 33/100$, mantidas constantes as condições atuais.
> **Rótulo obrigatório na interface e relatórios:** *"Tempo estimado até o limiar crítico do modelo ($\le 33/100$)"*. Trata-se de uma convenção didática interna de bancada, **não** de uma previsão demográfica de colapso ou extinção biológica na Baía de Todos-os-Santos.

### 8.4. Regeneração Natural e Modelo Causal de Restauração Coralina
- **Regeneração condicionada ao estresse:** A função de atualização da saúde biológica (`updateHealth`) calcula dano e regeneração apenas a partir das pressões ambientais efetivas. A regeneração natural só ocorre se o estresse calculado cair abaixo do limiar biológico ($\text{estresse} < 0,10$). Nenhum controle genérico adiciona bônus numérico à saúde do recife.
- **Intervenções de Mitigação Causais:** As intervenções atuam estritamente sobre fluxos físicos e estoques:
  - *Tratamento de esgoto (ETE):* Reduz até 75% da DBO contínua e pulsada;
  - *Interceptação de microplásticos:* Retém até 65% na drenagem superficial;
  - *Controle de erosão:* Retém até 60% de sedimentos suspensos a montante;
  - *Contenção e skimming:* Recolhe filme superficial de óleo acessível, sem remover frações já dissolvidas ou sedimentadas.
- **Restauração Coralina Mecanística (`coralRestoration`):** A intervenção de restauração de corais simula o transplante e fixação de fragmentos em substrato degradado condicionado à adequação ambiental ($S_{\text{env}} \in [0, 1]$).
  - Parâmetros biofísicos determinantes: oxigênio dissolvido ($\ge 5,0\text{ mg/L}$), temperatura e DHW (abaixo do limiar de branqueamento), pH ($\ge 8,0$), turbidez ($\le 8\%$) e óleo superficial ($\le 2\text{ kg}$).
  - Sob condições favoráveis, as colônias sobrevivem ($> 80\%$) e fixam-se gradualmente, expandindo a cobertura restaurada.
  - Sob condições hostis (água quente, hipóxia ou óleo), as colônias transplantadas sofrem mortalidade e a sobrevivência cai para próximo de zero, demonstrando pedagogicamente que a restauração física é ineficaz sem o prévio controle dos estressores ambientais.
  - Zero pontos artificiais são adicionados a `health.coral`.

---

## 9. Equações de Algas, Equilíbrio Trófico e Resiliência Relativa

- **Pressão / Cobertura de Algas ($0\text{ a }100$):**
  $$A = \text{clamp}\Big(0,15 + 0,75 \cdot P_{\text{nutrientes/DBO}} + 0,55 \cdot \left(1 - \frac{\text{Fauna}}{100}\right) + 0,20 \cdot \frac{\text{Turbidez}}{100} + 0,50 \cdot \left(1 - \frac{\text{Corais}}{100}\right),\ 0,\ 1\Big) \cdot 100$$
- **Equilíbrio Trófico ($0\text{ a }100$):**
  $$\text{Herbívoros} = \frac{\text{Cirurgião} + \text{Papagaio}}{2}, \qquad \text{Equilíbrio Trófico} = 0,65 \cdot \text{Herbívoros} + 0,35 \cdot (100 - A)$$
- **Índice Agregado do Modelo ($0\text{ a }100$):** média aritmética entre o índice dos corais e o índice da ictiofauna.

---

## 10. Fontes Externas, Ordem Operacional de Consulta e Semântica de Dados

### 10.1. Ordem Real de Consulta (Failover) para Dados Térmicos (NOAA CRW 5 km)
Implementada em [`src/services/noaaCrw.ts`](src/services/noaaCrw.ts) com orçamento total de `16 s` e timeout individual de `6 s`:
1. **Fonte Primária — PacIOOS ERDDAP (`pae-paha.pacioos.hawaii.edu/erddap`, dataset `dhw_5km`):** redistribuição oficial da grade de 5 km do NOAA Coral Reef Watch com suporte CORS direto no navegador, consultando o pixel oceânico exato de Frades (`-12.875°, -38.525°`) ou Barra (`-13.025°, -38.525°`).
2. **Fonte Secundária — NOAA CoastWatch ERDDAP / PFEG (`coastwatch.pfeg.noaa.gov/erddap`, dataset `NOAA_DHW`):** servidor ERDDAP oficial de contingência para os mesmos pixels de 5 km.
3. **Adaptador não operacional no navegador — Coral Watch Virtual Station API (`api.coral.tsr.lol`):** o serviço externo espelha a estação regional `todos_os_santos`, mas não autoriza CORS. Por isso, não integra o failover web atual; só deve ser reativado atrás de um proxy próprio, com cache, monitoramento e atribuição explícita da referência offshore.
4. **Contingência Offline Sob Demanda — Snapshots Históricos de 2024 (`noaaCrwSnapshots.ts`):** séries calibradas do evento de aquecimento marinho de mar/abr de 2024. **Nunca** substituem silenciosamente uma consulta com erro; só são carregadas por ação explícita do usuário e exibem o estado `Histórico / Contingência (2024)`.

> **Setor Estuarino do Paraguaçu:** por ser um canal estuarino estreito mascarado como continente na grade satelital de 5 km da NOAA, o adaptador retorna imediatamente o estado `Sem cobertura (no_coverage)` sem emitir requisições espúrias nem atribuir dados de mar aberto ao manguezal interno.

### 10.2. Semântica Estrita de `CRW_BAA` (Nível de Alerta de Branqueamento)
No esquema ERDDAP do NOAA CRW (`dhw_5km` / `NOAA_DHW`), a variável `CRW_BAA` (*Bleaching Alert Area*, unidade adimensional `1`, `_FillValue = 251`) representa a **categoria ordinal diária de alerta do pixel (0 a 7)** — e **não** uma área espacial em $\text{km}^2$.
- No Kirimurê, `CRW_BAA` é mapeada exclusivamente para `bleachingAlertLevel` (`0..7`), `CRW_BAA_7D_MAX` para `bleachingAlertMax7d`, e `bleachingAlertSourceVariable` registra a variável bruta de origem (`'CRW_BAA'`, `'baa_7day_max'` ou `'stress_level'`).

### 10.3. Modelo Hidrodinâmico Externo (Open-Meteo Marine)
Consultado em [`src/services/openMeteo.ts`](src/services/openMeteo.ts) (`marine-api.open-meteo.com/v1/marine`, `cell_selection=sea`) para previsão horária modelada de altura significativa de onda, velocidade/direção de corrente, temperatura superficial e nível do mar. Todos os valores são identificados na interface como **Modelo Externo**, com ressalva explícita sobre limitações de resolução costeira.

---

## 11. Classificação do Nível de Evidência dos Parâmetros

| Parâmetro / Conjunto | Valor no Sistema | Nível de Evidência | Fonte / Justificativa e Limites |
| :--- | :--- | :--- | :--- |
| Teto aproximado de microplásticos estuarinos na BTS | até `~33.000 part./m³` | **Medido** | Três campanhas em 10 ambientes estuarinos da BTS (Trindade et al., 2023); valores intermediários do controle são didáticos. |
| Solubilidade de saturação de $\text{O}_2$ | `6,55 mg/L` (`26,8 °C`, `35 PSU`) | **Publicado** | Equação termodinâmica de Weiss (1970). |
| Tempo de descarga da Baía Central (Frades) | `38 a 62 dias` | **Publicado** | Hidrodinâmica sazonal da BTS (Cirano & Lessa, 2007). |
| Constantes do sistema carbonato ($K_1, K_2, K'_{sp}$) | $\Omega_{\text{arag}} \approx 3,66$ na base | **Publicado** | Lueker et al. (2000), Dickson (1990) e Mucci (1983). |
| Toxicidade subletal de HPAs em corais ($\text{tPAH}_{50}$) | $\text{EC}_{50} = 10$ e $27\ \mu\text{g/L}$ | **Publicado** | Bioensaio controlado de 96 h (May et al., 2020). |
| Taxas cinéticas $k_{d,20}$, $\text{SOD}$ e $\theta$ | `0,12 d⁻¹`, `0,5 g/m²/d` | **Publicado** | Literatura de qualidade de água costeira (Bowie et al., 1985); faixas CONAMA 357. |
| Volumes de mistura e caixas Paraguaçu / Barra | $1,5\times 10^7$ a $1,0\times 10^8\text{ m}^3$ | **Hipótese do Modelo** | Parametrização comparativa entre estuário interno, baía central e canal oceânico. |
| Partição do óleo em 4 reservatórios internos | Filme, disperso, HPA, sedimento | **Hipótese do Modelo** | Formulação mecanística simplificada tipo caixa (inspirada em ADIOS), sem calibração local. |
| $\text{MMM}_{\text{didática}}$ do modelo térmico local | `28,0 °C` (limiar `29,0 °C`) | **Parâmetro Didático** | Convenção fixa inspirada em Leão et al. (2008); separada do DHW satelital oficial da NOAA. |
| Constantes de relaxamento $\tau_i$ | `2 a 20 dias` | **Parâmetro Didático** | Ordenação relativa de velocidades de resposta para exploração em sala. |
| Pesos `pollutantWeights`, `collapseDays` e limiar $\le 33$ | `28 a 75 dias` | **Parâmetro Didático** | Escala interna de resiliência por espécie (papagaio 28 d, cirurgião 36 d, sargentinho 48 d, corais 75 d). |

---

## 12. Geometria 3D e Correspondência Visual-Científica

A cena 3D em Babylon.js (`src/scene/babylon/runtime.ts`) obedece ao princípio de **correspondência estrita com as variáveis calculadas**:
- **Coluna d'água física:** plumas orgânicas/sedimentos respondem à pressão normalizada de esgoto (contínuo ou pulso de DBO) somada ao índice de **turbidez**; película superficial responde à massa retida de **óleo**; partículas em suspensão respondem à concentração de **microplásticos** (`part./m³`); cáusticas solares no fundo arenoso atenuam-se conforme a perda de transparência óptica.
- **Branqueamento dos corais:** vinculado exclusivamente às variáveis biológicas e químicas integradas no tempo (`health.coral`, `degreeHeatingWeeks` simulado e `effectivePh` real). Alterar o controle de temperatura em $t = 0$ **não** produz branqueamento instantâneo artificial antes que a dose térmica e a perda de saúde sejam efetivamente acumuladas.
- **Ictiofauna:** atividade, coloração e presença dos cardumes respondem à saúde calculada das três espécies (`health.fish` e `species`).

---

## 13. Referências Bibliográficas e Normativas Oficiais

1. **BRASIL. Conselho Nacional do Meio Ambiente (CONAMA).** Resolução nº 357, de 17 de março de 2005. Padrões de qualidade de águas salinas Classe 1 ($\text{OD} \ge 5,0\text{ mg/L}$).
2. **BOWIE, G. L. et al.** *Rates, Constants, and Kinetics Formulations in Surface Water Quality Modeling* (2nd ed.). US EPA, EPA/600/3-85/040, 1985.
3. **CIRANO, M.; LESSA, G. C.** Oceanographic characteristics of Baía de Todos os Santos, Brazil. *Revista Brasileira de Geofísica*, v. 25, n. 4, p. 363–387, 2007.
4. **DICKSON, A. G.; SABINE, C. L.; CHRISTIAN, J. R.** *Guide to Best Practices for Ocean CO₂ Measurements*. PICES Special Publication 3, 2007.
5. **LEÃO, Z. M. A. N.; KIKUCHI, R. K. P.; OLIVEIRA, M. D. M.** Branqueamento de corais nos recifes da Bahia e sua relação com anomalias térmicas. *Revista Brasileira de Geofísica*, v. 26, n. 4, p. 507–516, 2008.
6. **LUEKER, T. J.; DICKSON, A. G.; KEELING, C. D.** Ocean $p\text{CO}_2$ calculated from dissolved inorganic carbon, alkalinity, and equations for $K_1$ and $K_2$. *Marine Chemistry*, v. 70, p. 105–119, 2000.
7. **MAY, L. A. et al.** Effect of Louisiana sweet crude oil on a Pacific coral, *Pocillopora damicornis*. *Aquatic Toxicology*, v. 222, 105454, 2020.
8. **MUCCI, A.** The solubility of calcite and aragonite in seawater at various salinities, temperatures, and one atmosphere total pressure. *American Journal of Science*, v. 283, n. 7, p. 780–799, 1983.
9. **NOAA Coral Reef Watch.** *Version 3.1 Daily Global 5km Satellite Coral Bleaching Heat Stress Monitoring Products*. National Oceanic and Atmospheric Administration.
10. **TRINDADE, R. F. et al.** Microplastics in surface waters of tropical estuaries around a densely populated Brazilian bay. *Environmental Pollution*, v. 323, 121224, 2023.
11. **WEISS, R. F.** The solubility of nitrogen, oxygen and argon in water and seawater. *Deep Sea Research*, v. 17, n. 4, p. 721–735, 1970.
