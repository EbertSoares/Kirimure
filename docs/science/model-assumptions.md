# Mapeamento de Variáveis Científicas, Fórmulas e Premissas do Modelo Kirimurê

Este documento formaliza o inventário analítico de todas as variáveis ambientais, cinéticas e ecotoxicológicas do laboratório digital marinho **Kirimurê**, detalhando unidades físicas, origens epistemológicas, equações constitutivas, consumidores de interface e premissas ecológicas.

---

## 1. Classificação Epistemológica Canônica

Para garantir integridade perante os estudantes (11–14 anos) e pesquisadores, nenhuma informação é genericamente rotulada como "dado real". Cada grandeza pertence estritamente a uma das 5 categorias:

| Categoria | Identificador Técnico | Definição Operacional no Kirimurê |
|---|---|---|
| **Medição In-situ** | `in-situ` | Coleta ou leitura física instrumental direta no local (ex: amostragens de microplásticos por arrasto de plâncton por Trindade et al., 2023). |
| **Estimativa Satelital** | `satellite-derived` | Grandeza biofísica inferida por radiometria orbital remota (ex: SST do NOAA Coral Reef Watch 5km). |
| **Modelo Oceânico Externo** | `external-model` | Simulação numérica hidrodinâmica/meteorológica de grande escala (ex: Open-Meteo Marine / ECMWF WAM). |
| **Modelo Numérico Kirimurê** | `kirimure-model` | Cálculo diferencial ou estequiométrico interno executado em tempo real na caixa de mistura do Kirimurê. |
| **Cenário Didático** | `didactic-assumption` | Hipótese pedagógica controlada pelo usuário ou premissa de contorno para investigação causal. |

---

## 2. Mapa Detalhado de Variáveis

### 2.1. Temperatura da Água ($T$)
- **Símbolo / Unidade:** $T$ [°C]
- **Origem Primária:** `satellite-derived` (SST NOAA CRW 5km) ou `didactic-assumption` (manipulação pelo usuário).
- **Equações e Papel Físico:**
  - Controla solubilidade de gases (Weiss, 1970).
  - Modula taxas metabólicas via correções térmicas de Arrhenius ($\theta_{ka} = 1.024$, $\theta_{kd} = 1.047$).
  - Modula constantes de dissociação do sistema carbonato ($K_1, K_2$) e solubilidade de aragonita ($K'_{sp}$).
  - Alimenta a dose térmica acumulada (Graus de Aquecimento Semanal — DHW):
    $$\text{HotSpot} = \max(0, T - MMM)$$
    $$\text{DHW} = \frac{1}{7} \sum_{i=1}^{84} \text{HotSpot}_i \quad (\text{para } \text{HotSpot} \ge 1.0 \text{ °C})$$
- **Componentes Consumidores:** `MarineScene.tsx` (branqueamento visual), `EnvironmentDrawer.tsx` (slider térmico), `SciencePanel.tsx` (painel oceanográfico), `OxygenTrendChart.tsx`.
- **Premissas e Limitações:** A MMM (Média Máxima Mensal) da BTS é calibrada em 28,0 °C para fins didáticos. O produto NOAA 5km possui grade regional e não resolve canais estuarinos estreitos.

---

### 2.2. Oxigênio Dissolvido ($OD$)
- **Símbolo / Unidade:** $[OD]$ [$\text{mg } O_2/\text{L}$] (equivalente a $\text{g } O_2/\text{m}^3$)
- **Origem:** `kirimure-model`
- **Equação Diferencial Acoplada:**
  $$\frac{d[OD]}{dt} = k_a (C_s - [OD]) - k_d [CBOD_u] - \frac{SOD}{H} + (P - R)$$
  Onde:
  - $C_s(T, S)$ [$\text{mg/L}$]: Solubilidade de equilíbrio ar-mar calculada pela equação oceanográfica de Weiss (1970):
    $$\ln C_s = A_1 + A_2 \frac{100}{T_K} + A_3 \ln\left(\frac{T_K}{100}\right) + A_4 \left(\frac{T_K}{100}\right) + S \left[B_1 + B_2 \left(\frac{T_K}{100}\right) + B_3 \left(\frac{T_K}{100}\right)^2\right]$$
    ($A_1=-173.4292$, $A_2=249.6339$, $A_3=143.3483$, $A_4=-21.8492$, $B_1=-0.033096$, $B_2=0.014259$, $B_3=-0.0017$).
  - $k_a(W, H, T)$ [$\text{dia}^{-1}$]: Coeficiente de reaeração superficial:
    $$k_{a,20} = \frac{0.728 \sqrt{W} - 0.317 W + 0.0372 W^2}{H}, \quad k_a = k_{a,20} \times 1.024^{T - 20}$$
    Com $W$ = velocidade do vento [m/s] e $H$ = profundidade média do compartimento [m].
  - $k_d(T)$ [$\text{dia}^{-1}$]: Desoxigenação bacteriana: $k_d = 0.12 \times 1.047^{T - 20}$.
  - $SOD$ [$\text{g } O_2/\text{m}^2/\text{dia}$]: Demanda bentônica de oxigênio do sedimento ($0.50\text{ g/m}^2/\text{dia}$).
  - $P - R$ [$\text{mg/L/dia}$]: Balanço metabólico fotossíntese/respiração, onde $P$ é atenuada por turbidez e filme de óleo:
    $$P = 0.5 \times (1 - \text{bloqueio\_luz}), \quad R = 0.35 + 0.4 \times \frac{\text{algae}}{100}$$
- **Solução Estacionária Analítica:**
  $$[OD]_{eq} = C_s - \frac{k_d [CBOD_u]_{eq} + \frac{SOD}{H} - (P - R)}{k_a}$$
- **Classificação Ecológica (Normas US EPA / CONAMA 357):**
  - $\ge 5.0\text{ mg/L}$: Normóxia (ambiente saudável)
  - $3.0 - 5.0\text{ mg/L}$: Estresse respiratório (redução da mobilidade)
  - $2.0 - 3.0\text{ mg/L}$: Hipóxia (fuga de peixes móveis)
  - $0.2 - 2.0\text{ mg/L}$: Hipóxia severa (asfixia e necrose de tecidos)
  - $< 0.2\text{ mg/L}$ (piso computacional $0.05\text{ mg/L}$): Anóxia (mortalidade massiva aeróbia)
- **Componentes Consumidores:** `MarineScene.tsx` (respiração e nado de peixes), `IndicatorProgress.tsx`, `OxygenTrendChart.tsx`, `SciencePanel.tsx`.
- **Premissa de Estabilidade:** Salvaguarda numérica de saturação estequiométrica mínima em 0,05 mg/L para evitar indefinições diferenciais, declarada expressamente como limite computacional e não ausência absoluta matemática de oxigênio.

---

### 2.3. Demanda Bioquímica de Oxigênio ($DBO_5$ e $CBOD_u$)
- **Símbolos / Unidades:**
  - Carga de entrada: massa em pulso [kg $DBO_5$] ou taxa contínua [kg $DBO_5$/dia].
  - Concentração no meio: $[CBOD_u]$ [$\text{mg } O_2/\text{L}$].
- **Origem:** `didactic-assumption` (entrada de efluente) $\to$ `kirimure-model` (cinética).
- **Conversão Estequiométrica DBO₅ $\to$ CBODu:**
  Considerando cinética de 1ª ordem com $k_{d,20} = 0.12\text{ dia}^{-1}$ em ensaio padrão de 5 dias a 20 °C:
  $$DBO_5 = CBOD_u \times (1 - e^{-5 \times 0.12}) = CBOD_u \times (1 - e^{-0.60}) \approx 0.4512 \times CBOD_u$$
  $$\therefore CBOD_u = \frac{DBO_5}{1 - e^{-0.60}} \approx 2.2163 \times DBO_5$$
- **Aplicação no Modelo de Caixa:**
  - **Modo Pulso Único:** $\Delta [CBOD_u] = \frac{CBOD_u \text{ [kg]} \times 1000}{V_{\text{mistura}} \text{ [m}^3\text{]}}$ no instante $t=0$.
  - **Modo Contínuo Diário:** $L_{\text{entrada}} = \frac{CBOD_{u,\text{diário}} \text{ [kg/dia]} \times 1000}{V_{\text{mistura}} \text{ [m}^3\text{]}}$ [$\text{mg/L/dia}$].
  - **Equação Cinética:**
    $$\frac{d[CBOD_u]}{dt} = L_{\text{entrada}} - \left(k_d + \frac{1}{\tau}\right) [CBOD_u]$$
    Onde $\tau$ é o tempo de residência hidrodinâmica do setor (dias).
- **Componentes Consumidores:** `EnvironmentDrawer.tsx` (seletor contínuo/pulso), `EvidenceDrawer.tsx`, `OxygenTrendChart.tsx`.

---

### 2.4. Sistema Carbonato e Saturação de Aragonita ($\Omega_{\text{arag}}$)
- **Símbolos / Unidades:**
  - Alcalinidade Total ($TA$): [$\mu\text{mol/kg}$] (base: $2350\text{ }\mu\text{mol/kg}$ a 35 PSU)
  - Carbono Inorgânico Dissolvido ($DIC$): [$\mu\text{mol/kg}$]
  - Pressão parcial de $CO_2$ ($pCO_2$): [$\mu\text{atm}$]
  - Íon Carbonato ($[CO_3^{2-}]$): [$\mu\text{mol/kg}$]
  - Saturação de Aragonita ($\Omega_{\text{arag}}$) e Calcita ($\Omega_{\text{calc}}$): [adimensional]
- **Origem:** `kirimure-model`
- **Equações Termodinâmicas:**
  - Cálcio livre na água do mar (Riley & Tongudai, 1967):
    $$[Ca^{2+}] = 0.01028 \times \left(\frac{S}{35}\right) \text{ [mol/kg]}$$
  - Produtos de solubilidade aparente $K'_{sp}$ segundo Mucci (1983):
    $$\Omega_{\text{arag}} = \frac{[Ca^{2+}] [CO_3^{2-}]}{K'_{sp,\text{arag}}(T, S)}, \quad \Omega_{\text{calc}} = \frac{[Ca^{2+}] [CO_3^{2-}]}{K'_{sp,\text{calc}}(T, S)}$$
  - Constantes de dissociação do ácido carbônico $K_1$ e $K_2$ na escala Total de pH segundo Lueker et al. (2000).
  - Alcalinidade carbonática corrigida pela contribuição de borato de Uppström (1974) / Dickson (1990):
    $$TA_{\text{carb}} = TA - \frac{416 \times (S/35)}{1 + [H^+] / 10^{-8.6}}$$
  - Acoplamento estequiométrico com a respiração bacteriana da DBO:
    $$\Delta DIC = \Delta [O_2]_{\text{consumido}} \times RQ \quad (RQ = 0.98\text{ mol } CO_2/\text{mol } O_2)$$
- **Faixas de Saturação de Aragonita para Corais Tropicais:**
  - $\Omega_{\text{arag}} \ge 3.5$: Ótimo (calcificação vigorosa)
  - $3.0 \le \Omega_{\text{arag}} < 3.5$: Adequado
  - $2.0 \le \Omega_{\text{arag}} < 3.0$: Marginal (redução de crescimento esquelético)
  - $1.0 \le \Omega_{\text{arag}} < 2.0$: Estresse severo (fragilização de ramos)
  - $\Omega_{\text{arag}} < 1.0$: Corrosivo (dissolução mineral espontânea de aragonita)
- **Componentes Consumidores:** `MarineScene.tsx` (aparência de corais), `SciencePanel.tsx`, `EvidenceDrawer.tsx`.

---

### 2.5. Ecotoxicologia e Destino de Óleo
- **Símbolos / Unidades:**
  - Massa total introduzida: $M_{\text{total}}$ [kg]
  - Reservatórios físicos: $M_{\text{superfície}}$, $M_{\text{coluna}}$, $M_{\text{tPAH50}}$, $M_{\text{sedimento}}$, $M_{\text{evaporado}}$, $M_{\text{exportado}}$, $M_{\text{recolhido}}$ [kg]
  - Concentração solúvel biodisponível: $[tPAH50]$ [$\mu\text{g/L}$]
  - Espessura do filme: $d_{\text{óleo}}$ [$\mu\text{m}$]
- **Origem:** `didactic-assumption` (vazamento) $\to$ `kirimure-model` (partição).
- **Balanço Estrito de Conservação de Massa:**
  $$M_{\text{total}} = M_{\text{superfície}} + M_{\text{coluna}} + M_{\text{tPAH50}} + M_{\text{sedimento}} + M_{\text{evaporado}} + M_{\text{exportado}} + M_{\text{recolhido}}$$
  Com resíduo numérico $|M_{\text{total}} - \sum M_i| < 10^{-4}\text{ kg}$ verificado a cada passo de integração.
- **Cinéticas Físico-Químicas:**
  - Evaporação atmosférica de voláteis leves ($C_1 - C_{10}$, cinética ADIOS):
    $$M_{\text{evap}} = M_{\text{total}} \times 0.30 \times (1 - e^{-t / 1.5})$$
  - Exportação hidrodinâmica para fora da BTS:
    $$M_{\text{exp}} = M_{\text{total}} \times 0.20 \times (1 - e^{-t / \tau})$$
  - Partição da massa restante interna:
    - Filme superficial: $f_{\text{surf}} \propto 0.60 e^{-t/4.0}$
    - Gotículas dispersas na coluna: $f_{\text{disp}} \propto 0.25 (1 - e^{-t/2.0}) e^{-t/8.0}$
    - Deposição bentônica / sedimento: $f_{\text{sed}} \propto \min(0.25, 0.05 + 0.15 (1 - e^{-t/6.0}))$
    - HPAs solúveis biodisponíveis ($tPAH50$): $f_{\text{pah}} \propto 0.015 (1 - e^{-t/2.5})$
- **Ecotoxicologia Subletal (Bioensaio May et al., 2020 para Siderastrea/Pocillopora):**
  - Concentração: $[tPAH50] = \frac{M_{\text{tPAH50}} \times 10^9}{V_{\text{mistura}} \times 1000}$ [$\mu\text{g/L}$]
  - Inibição de regeneração tecidual (equação de Hill, $n=2$, $EC_{50} = 10\text{ }\mu\text{g/L}$):
    $$I_{\text{tecido}} = \frac{100 \times [tPAH50]^2}{10^2 + [tPAH50]^2} \text{ [\%]}$$
  - Risco de retração de pólipos: Baixo ($<3\text{ }\mu\text{g/L}$), Moderado ($3 - 10\text{ }\mu\text{g/L}$), Severo ($10 - 27\text{ }\mu\text{g/L}$), Crítico ($\ge 27\text{ }\mu\text{g/L}$).
- **Intervenções Operacionais:**
  - Barreiras de contenção: reduzem o fator de espalhamento superficial (de 150 para $85\text{ m}^2/\text{kg}$), contendo a área da mancha.
  - Skimming mecânico: recolhe massa exclusivamente do filme superficial acessível, transferindo-a para $M_{\text{recolhido}}$ e preservando as frações já evaporadas, dispersas ou dissolvidas.
- **Componentes Consumidores:** `MarineScene.tsx` (filme superficial translúcido, gotículas na coluna), `EnvironmentDrawer.tsx`, `SciencePanel.tsx`.

---

### 2.6. Microplásticos em Estuários da BTS
- **Símbolo / Unidade:** $C_{\text{MP}}$ [$\text{itens/m}^3$ de água superficial]
- **Origem:** `in-situ` (dados empíricos de Trindade et al., 2023).
- **Inventário de Amostragem Empírica verificável:**
  - Três campanhas em 10 ambientes estuarinos ao redor da BTS.
  - Abundâncias de até aproximadamente $33.000\text{ itens/m}^3$.
  - Partículas de $50$ a $5.000\text{ }\mu\text{m}$, com predominância abaixo de $150\text{ }\mu\text{m}$.
  - Aporte anual estimado pelos três maiores rios: $3{,}88 \times 10^{12}$ itens.
  - Médias, mínimos, máximos e percentuais exatos por rio não são exibidos sem a tabela ou suplemento rastreável do artigo.
- **Rigor Dimensional Estrito:** Os dados são mantidos e exibidos estritamente em $\text{itens/m}^3$. Não se realiza conversão linear arbitrária para massa em kg sem distribuição granulométrica de densidades poliméricas.
- **Visualização:** Partículas discretas determinísticas baseadas em semente fixa (sem números pseudoaleatórios variando a cada frame de renderização).

---

## 3. Setores Hidrográficos e Volumes de Mistura

| Setor | ID | Profundidade Média ($H$) | Volume de Mistura ($V_{\text{mistura}}$) | Tempo de Renovação ($\tau$) | Salinidade de Linha de Base ($S$) |
|---|---|---|---|---|---|
| **Ilha dos Frades / Recifes Centrais** | `frades` | $8.0\text{ m}$ | $3.2 \times 10^7\text{ m}^3$ | $38\text{ dias}$ (faixa publicada BTS: $38$–$62$) | $35.0\text{ PSU}$ |
| **Estuário do Rio Paraguaçu** | `paraguacu` | $5.0\text{ m}$ | $1.5 \times 10^7\text{ m}^3$ | $75\text{ dias}$ (hipótese didática) | $22.0\text{ PSU}$ |
| **Canal da Barra / Entrada Oceânica** | `barra` | $25.0\text{ m}$ | $1.0 \times 10^8\text{ m}^3$ | $9\text{ dias}$ (hipótese didática) | $36.5\text{ PSU}$ |

Fonte hidrodinâmica publicada: Cirano & Lessa (2007) para o tempo de descarga da BTS. Profundidades, volumes de mistura e tempos específicos de Paraguaçu/Barra são hipóteses de compartimentação do modelo, não valores extraídos diretamente do artigo.
