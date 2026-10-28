# Laboratório Digital Marinho Kirimurê
## Caderno Consolidado de Dados, Fórmulas, Parâmetros e Métricas de Simulação

Este documento reúne a totalidade dos dados científicos, parâmetros matemáticos, constantes cinéticas, formulações ecológicas, referências normativas e coordenadas computacionais utilizados no desenvolvimento do **Laboratório Digital Marinho Kirimurê** (Baía de Todos-os-Santos, Bahia).

---

## Sumário

1. [Identificação Geral do Ecossistema](#1-identificação-geral-do-ecossistema)
2. [Escala Temporal e Resolução Cinética](#2-escala-temporal-e-resolução-cinética)
3. [Compartimentação e Hidrodinâmica da Baía de Todos-os-Santos](#3-compartimentação-e-hidrodinâmica-da-baía-de-todos-os-santos)
4. [Variáveis de Entrada e Condições de Linha de Base](#4-variáveis-de-entrada-e-condições-de-linha-de-base)
5. [Dinâmica Bioquímica do Oxigênio Dissolvido (OD) e Hipóxia](#5-dinâmica-bioquímica-do-oxigênio-dissolvido-od-e-hipóxia)
6. [Acúmulo de Estresse Térmico e Degree Heating Weeks (DHW)](#6-acúmulo-de-estresse-térmico-e-degree-heating-weeks-dhw)
7. [Parâmetros de Acidificação e pH Costeiro](#7-parâmetros-de-acidificação-e-ph-costeiro)
8. [Matriz de Sensibilidade e Parâmetros das Espécies](#8-matriz-de-sensibilidade-e-parâmetros-das-espécies)
9. [Equações de Algas, Equilíbrio Trófico e Resiliência](#9-equações-de-algas-equilíbrio-trófico-e-resiliência)
10. [Geometria, Projeção 3D e Coordenadas Cartográficas](#10-geometria-projeção-3d-e-coordenadas-cartográficas)
11. [Temporização de Animação e Comportamento dos Predadores](#11-temporização-de-animação-e-comportamento-dos-predadores)
12. [Referências Bibliográficas e Normativas Oficiais](#12-referências-bibliográficas-e-normativas-oficiais)

---

## 1. Identificação Geral do Ecossistema

- **Nome Oficial:** Kirimurê — Laboratório Digital Marinho
- **Ecossistema Modelado:** Recifes de franja, fundos de algas calcárias e comunidades ictiológicas da Baía de Todos-os-Santos (BTS), Bahia, Brasil.
- **Bioma:** Amazônia Azul / Província Recifal do Atlântico Sudoeste Tropical.
- **Espécies Formadoras de Recife:** *Siderastrea stellata*, *Mussismilia hispida*, *Mussismilia harttii*, *Montastraea cavernosa*, além de algas coralináceas crostosas (CCA).
- **Abordagem Pedagógica:** Investigação guiada com ciclo epistemológico tripartido: **Preveja (Hipótese) $\rightarrow$ Teste (Intervenção Experimental) $\rightarrow$ Compare (Evidência)**.

---

## 2. Escala Temporal e Resolução Cinética

A simulação opera desacelerada intencionalmente para permitir observação didática dos fenômenos de bioacumulação e inércia biogeoquímica:

| Parâmetro | Valor | Unidade | Descrição / Função |
| :--- | :--- | :--- | :--- |
| `tickRate` | `10` | Hz | 10 passos de cálculo por segundo de relógio |
| `daysPerRealSecond` (1×) | `0.25` | dias / s real | 1 dia simulado equivale a 4 segundos de tempo real |
| Velocidade 1× | `1 dia / 4 s` | dias simulados | Ritmo de investigação padrão |
| Velocidade 3× | `1 dia / 1.33 s`| dias simulados | Aceleração para verificação de médio prazo |
| Velocidade 5× | `1 dia / 0.80 s`| dias simulados | Aceleração para desfecho estacional |
| Velocidade 10× | `1 dia / 0.40 s`| dias simulados | Aceleração anual didática (365 dias em ~146 s) |

### Constantes de Relaxamento Cinético ($\tau$ em dias)

O ambiente não muda instantaneamente. Segue uma equação de transporte de primeira ordem:

$$X(t + \Delta t) = X(t) + \left( X_{\text{meta}} - X(t) \right) \cdot \left( 1 - e^{-\Delta t / \tau_i} \right)$$

| Forçante / Variável ($i$) | $\tau_i$ (dias) | Justificativa Físico-Ecológica |
| :--- | :--- | :--- |
| **Temperatura** | `7` | Inércia térmica do volume d'água da camada de mistura |
| **pH** | `12` | Sistema tampão de carbonatos marinho |
| **Microplásticos** | `5` | Tempo médio de mistura na pluma superficial |
| **Óleo / Petróleo** | `3` | Espalhamento de filme, evaporação de frações voláteis e emulsão |
| **Esgoto (DBO)** | `4` | Tempo de hidrólise e decaimento bacteriano primário |
| **Turbidez** | `4` | Advecção por maré e sedimentação de partículas |
| **Pressão de Pesca** | `2` | Resposta rápida do esforço pesqueiro |
| **Recuperação Ambiental** | `20` | Implantação e maturação de medidas de conservação e berçários |

---

## 3. Compartimentação e Hidrodinâmica da Baía de Todos-os-Santos

A BTS possui compartimentos hidrodinâmicos com tempos de renovação e residência de efluentes distintos:

| Compartimento | Sub-região | $\tau_{\text{descarga}}$ (Inverno) | $\tau_{\text{descarga}}$ (Verão) | Salinidade Base | Temp. Base | Retenção aos 30 dias |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Ilha dos Frades & Itaparica** | Baía Central (Recifes) | `38 dias` | `61 dias` | `35.0 PSU` | `26.8 °C` | **`53.4%` (Moderada)** |
| **Estuário do Paraguaçu** | Fundo da Baía / Manguezais | `75 dias` | `120 dias` | `22.0 PSU` | `27.2 °C` | **`72.6%` (Alta)** |
| **Boca da Baía / Barra** | Canal de Salvador (Atlântico) | `9 dias` | `14 dias` | `36.5 PSU` | `26.4 °C` | **`7.4%` (Baixa)** |

### Cálculo da Carga Efetiva Recebida ($H = 30$ dias)

$$\text{Retenção}_{\text{inverno}} = e^{-30 / \tau_{\text{inverno}}}$$

$$\text{Retenção}_{\text{verão}} = e^{-30 / \tau_{\text{verão}}}$$

$$\text{Retenção Central} = \frac{\text{Retenção}_{\text{inverno}} + \text{Retenção}_{\text{verão}}}{2}$$

Para Ilha dos Frades:
$$\text{Retenção Central} = \frac{e^{-30/38} + e^{-30/60.8}}{2} = \frac{0.454 + 0.611}{2} = 0.5338 \approx 53.4\%$$

---

## 4. Variáveis de Entrada e Condições de Linha de Base

| Fator de Estresse | Baseline | Faixa Didática | Passo | Unidade | Referência Regional BTS |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Temperatura da Água** | `26.8` | `24.0 a 31.0` | `0.1` | °C | Águas de verão: branqueamento a 29–30 °C |
| **pH da Água** | `8.10` | `7.70 a 8.20` | `0.01` | — | Superfície marinha oceânica atual ≈ 8.1 |
| **Microplásticos** | `0` | `0 a 100.000` | `1` | kg | Estuários BTS: 5.176 a 32.784 part./m³ |
| **Óleo / Petróleo** | `0` | `0 a 100.000` | `1` | kg | Limiar subletal de tPAH50: 10 a 27 $\mu$g/L |
| **Esgoto (DBO₅)** | `0` | `0 a 100.000` | `1` | kg DBO₅ | Indicador de matéria orgânica oxidável |

### Opções em Escala Logarítmica Didática para Cargas de Massa (kg)
`[0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]`

---

## 5. Dinâmica Bioquímica do Oxigênio Dissolvido (OD) e Hipóxia

A modelagem de OD acopla termodinâmica de solubilidade com consumo microbiano aeróbico e demanda biológica por eutrofização:

### 1. Solubilidade de Saturação (Weiss, 1970)
A $26.8$ °C e $35.0$ PSU, a concentração de saturação do oxigênio na BTS é:
$$S_0 = 7.12\text{ mg/L}$$

Efeito da variação térmica:
$$S(T) = 7.12 - 0.12 \cdot (T - 26.8)$$

### 2. Demanda Bioquímica por Efluente e Floração Algal
$$\text{Demanda Orgânica (DBO)} = \left(\frac{\text{CargaRecebida}_{\text{esgoto}}}{\text{CargaMáxima}}\right) \cdot 4.40\text{ mg/L}$$

$$\text{Demanda Algal (Respiração)} = \left(\frac{\text{CoberturaAlgas}}{100}\right) \cdot 1.10\text{ mg/L}$$

### 3. Concentração Efetiva de Oxigênio Dissolvido
$$\text{OD} = \text{clamp}\left( S(T) - \text{Demanda Orgânica} - \text{Demanda Algal}, 0.40, 8.50 \right)\text{ mg/L}$$

### 4. Faixas Normativas e Estresse de Hipóxia (CONAMA 357 / US EPA)

| Concentração de OD | Regime Respiratório | Estresse Biológico | Efeito Ecológico na Fauna |
| :--- | :--- | :--- | :--- |
| **$\ge 5.0\text{ mg/L}$** | **Normóxia Plena** (CONAMA Classe 1) | `0.00` | Respiração desobstruída, cardumes ativos |
| **$3.0\text{ a }5.0\text{ mg/L}$** | **Estresse Respiratório** | `0.00 a 0.35` | Aumento da frequência opercular, nado letárgico |
| **$2.0\text{ a }3.0\text{ mg/L}$** | **Hipóxia Crítica** | `0.35 a 0.75` | Fuga para superfície, paralisação de desova |
| **$< 2.0\text{ mg/L}$** | **Hipóxia Severa / Anóxia** | `0.75 a 1.00` | Asfixia aguda e mortandade em massa da fauna |

Formulação contínua do índice de estresse por hipóxia:
$$E_{\text{hipóxia}} = \begin{cases} 0, & \text{se } \text{OD} \ge 5.0 \\ \frac{5.0 - \text{OD}}{5.0 - 3.0} \cdot 0.35, & \text{se } 3.0 \le \text{OD} < 5.0 \\ 0.35 + \frac{3.0 - \text{OD}}{3.0 - 2.0} \cdot 0.40, & \text{se } 2.0 \le \text{OD} < 3.0 \\ 0.75 + \frac{2.0 - \text{OD}}{2.0} \cdot 0.25, & \text{se } \text{OD} < 2.0 \end{cases}$$

---

## 6. Acúmulo de Estresse Térmico e Degree Heating Weeks (DHW)

Implementação estrita da metodologia operacional do **NOAA Coral Reef Watch (CRW)**:

- **MMM didática (Maximum Monthly Mean):** $28.0\text{ °C}$
- **Limiar de Branqueamento (*Bleaching Threshold*):** $\text{MMM} + 1.0\text{ °C} = 29.0\text{ °C}$
- **HotSpot:** $\text{SST} - 28.0\text{ °C}$
- **Janela de Integração:** 84 dias móveis (12 semanas consecutivas)

$$\text{Graus-Dia}_i = \begin{cases} (T_i - \text{MMM}) \cdot \Delta t_i, & \text{se } (T_i - \text{MMM}) \ge 1.0\text{ °C} \\ 0, & \text{se } (T_i - \text{MMM}) < 1.0\text{ °C} \end{cases}$$

$$\text{DHW} = \frac{1}{7} \sum_{i \in 84\text{ dias}} \text{Graus-Dia}_i \quad [ \text{°C-semanas} ]$$

### Escala de Severidade do DHW

| DHW (°C-semanas) | Categoria NOAA | Resposta dos Corais da BTS |
| :--- | :--- | :--- |
| **$0.0$** | Sem Estresse | Tecidos íntegros e simbiose ativa |
| **$> 0.0\text{ e }< 4.0$** | Atenção Térmica | Palidez sutil nas pontas (*pale tips*) |
| **$4.0\text{ a }8.0$** | **Alerta 1** | Branqueamento significativo evidente |
| **$8.0\text{ a }20.0$** | **Alerta 2** | Branqueamento severo generalizado e mortalidade |
| **$\ge 20.0$** | **Alerta Extremo** | Mortalidade catastrófica da colônia recifal |

---

## 7. Parâmetros de Acidificação e pH Costeiro

- pH Oceânico Limpo: $8.10$
- Limiar de estresse inicial em corais: $\text{pH} \le 8.00$
- Limiar crítico (dissolução / inibição de aragonita): $\text{pH} \le 7.70$
- Acoplamento com matéria orgânica (acidificação por decomposição de esgoto):
  $$\Delta \text{pH}_{\text{org}} = \left(\frac{\text{Esgoto Recebido}}{\text{Esgoto Máximo}}\right) \cdot 0.08$$
  $$\text{pH}_{\text{efetivo}} = \text{pH}_{\text{físico}} - \Delta \text{pH}_{\text{org}}$$

---

## 8. Matriz de Sensibilidade e Parâmetros das Espécies

### 1. Pesos de Pressão em Corais e Peixes
$$E_{\text{poluentes}} = \sum_j W_j \cdot P_j$$

| Pressão ($j$) | Peso em Corais ($W_{\text{coral}}$) | Peso em Peixes ($W_{\text{peixe}}$) |
| :--- | :--- | :--- |
| **Óleo** | `0.75` | `0.55` |
| **Esgoto / DBO** | `0.55` | `0.40` |
| **Sedimentos / Turbidez** | `0.60` | `0.35` |
| **Microplásticos** | `0.14` | `0.35` |
| **Pesca** | `0.30` | `0.85` |

**Fator de Sinergia Térmico-Poluente nos Corais:** $S_{\text{sinergia}} = 0.50$
$$E_{\text{coral}} = E_{\text{base}} \cdot \left( 1 + 0.50 \cdot \min(P_{\text{térmico}}, P_{\text{pior\_poluição}}) \right)$$

### 2. Espécies Representativas do Recife da BTS

| Parâmetro | Peixe-cirurgião (*Acanthurus*) | Sargentinho (*Abudefduf*) | Peixe-papagaio (*Scarus*) |
| :--- | :--- | :--- | :--- |
| **Nicho Trófico** | Herbívoro raspador | Onívoro generalista | Herbívoro bioerosor |
| **Dias p/ Colapso** | `62 dias` | `78 dias` | `48 dias` |
| **Sensib. Térmica** | `1.20` (Muito Alta) | `0.85` (Moderada) | `1.05` (Alta) |
| **Sensib. Acidificação** | `1.10` | `1.00` | `1.20` (Muito Alta) |
| **Sensib. Óleo** | `1.00` | `1.10` | `0.95` |
| **Sensib. Microplásticos**| `1.00` | `1.25` (Confunde c/ plâncton) | `0.90` |
| **Sensib. Esgoto / Hipóxia**| `0.85` | `1.25` | `1.05` |
| **Sensib. Turbidez** | `1.30` | `0.80` | `1.00` |
| **Sensib. Sobrepesca** | `0.70` | `0.90` | `1.60` (Extremamente Alta) |

---

## 9. Equações de Algas, Equilíbrio Trófico e Resiliência

### Cobertura de Algas Competidoras ($0\text{ a }100\%$)
$$A = \text{clamp}\Big( 0.15 + 0.75 \cdot \text{Nutrientes} + 0.55 \cdot (1 - \text{Fauna}) + 0.20 \cdot \text{Turbidez} + 0.50 \cdot (1 - \text{Corais}) \Big) \cdot 100$$

### Equilíbrio Trófico
Baseia-se na densidade de herbívoros responsáveis por conter o avanço das macroalgas:
$$\text{Herbívoros} = \frac{\text{Pop}_{\text{cirurgião}} + \text{Pop}_{\text{papagaio}}}{2}$$

$$\text{Equilíbrio Trófico} = 0.65 \cdot \text{Herbívoros} + 0.35 \cdot (100 - A)$$

### Índice Integrado de Resiliência
$$\text{Resiliência Geral} = \frac{\text{Saúde Corais} + \text{Saúde Fauna}}{2}$$

---

## 10. Geometria, Projeção 3D e Coordenadas Cartográficas

### 1. Mapa do Brasil e Localização da Bahia (SVG)
- **ViewBox:** `1100 x 1000`
- **Polígono da Bahia:**
  - $X_{\text{mín}} = 682.0$, $X_{\text{máx}} = 901.3$ (Largura = $219.3$ px)
  - $Y_{\text{mín}} = 369.0$, $Y_{\text{máx}} = 612.0$ (Altura = $243.0$ px)
  - **Centro Geométrico Exato:** $X = 794.2$ px ($72.2\%$), $Y = 480.0$ px ($48.0\%$)
- **Parâmetros da Transição Cinematográfica:**
  - `transform-origin`: `72.2% 48.0%`
  - Escala de Aproximação: `scale(6.5)`
  - Duração do Zoom: `1600ms` com `cubic-bezier(0.2, 0, 0.25, 1)`
  - Duração do Escurecimento: `1100ms` com `cubic-bezier(0.4, 0, 0.2, 1)`
  - Sincronização: Troca de tela aos `1250ms`, dissipação suave do véu aos `1450ms` (fade-out de `550ms`).

### 2. Câmera e Projeção Subaquática (Babylon.js)
- **Câmera:** `FreeCamera`, posição `(0, 0, 0)`, apontando para $+Z$.
- **Field of View (FOV):** $45^\circ$ ($0.785398$ radianos).
- **Aspect Ratio Nominal:** $16:9 \approx 1.77778$.
- **Constante Focal:** $\tan(\text{FOV} / 2) = \tan(22.5^\circ) \approx 0.41421356$.
- **Conversão de Coordenadas de Tela ($u, v \in [0, 1]$) para o Espaço de Mundo 3D ($X, Y, Z$):**
  $$\text{halfH} = Z \cdot \tan\left(\frac{\text{FOV}}{2}\right) = Z \cdot 0.41421356$$
  $$\text{halfW} = \text{halfH} \cdot \text{aspect}$$
  $$X_{\text{mundo}} = (2u - 1) \cdot \text{halfW}$$
  $$Y_{\text{mundo}} = (1 - 2v) \cdot \text{halfH}$$

### 3. Profundidades de Renderização dos Planos 3D ($Z$)
- Fundo Fotográfico / Backdrop: $Z = 60.0$
- Véu de Sedimentos / Esgoto: $Z = 58.8$
- Camada de Corais / Branqueamento: $Z = 58.3$
- Sombras Volumétricas de Óleo: $Z = 58.2$
- Plano de Nado Médio dos Cardumes (`PLANE_Z`): $Z = 30.0$ (variação dinâmica $Z \in [28.2, 31.8]$)
- Bolhas de Aeração e Partículas de Plástico: $Z \in [28.0, 31.0]$

---

## 11. Temporização de Animação e Comportamento dos Predadores

### Cardumes 2.5D (*FishSwimmer*)
- Orientação do Sprite: Inversão horizontal (`scaling.x = -worldScale * currentDir`) para manter o focinho sempre apontado no sentido do avanço.
- Frequência de Nado: $5.4\text{ a }5.7\text{ Hz} + \text{estresse} \cdot 0.8\text{ Hz}$.
- Propagação de Onda Caudal:
  $$\text{fase} = \phi_{\text{cauda}} - \left(\frac{x}{L} + 0.5\right) \cdot 4.2$$

### Cardume 3D Riggado (*Pale Bleak* / 43 Ossos)
- Animação Esquelética: Loop contínuo a $1.18\text{ a }1.60\text{ Hz}$.
- Rotação 3D em 360° com guinada (*Yaw*), arfagem (*Pitch*) e rolamento de curva (*Bank*).

### Tubarão-Recifal 3D (*Carcharhinus perezi*)
- **Tempo para Primeira Aparição:** `3 a 5 segundos` de relógio real após o início/reset.
- **Intervalo Recorrente de Cooldown:** `14 a 22 segundos` de relógio real.
- **Padrões de Patrulha Alternados:**
  1. *Approaching:* Surge do fundo central ($Z_{\text{relativo}} = 0.02$) em direção à câmera ($Z_{\text{relativo}} = 0.88$), causando dispersão nos cardumes próximos, e realiza curva em C saindo pela lateral.
  2. *Camera Flyby:* Cruza rente à câmera em velocidade constante de ponta a ponta da tela.
- **Deformação Axial Carangiforme:** Focinho estabilizado em $x = -0.5$ e amplitude lateral crescente na nadadeira caudal ($x = +0.5$).

---

## 12. Referências Bibliográficas e Normativas Oficiais

1. **BRASIL. Conselho Nacional do Meio Ambiente (CONAMA).** Resolução nº 357, de 17 de março de 2005. Dispõe sobre a classificação dos corpos de água e diretrizes ambientais para o seu enquadramento. *Diário Oficial da União*, Brasília, DF, 2005. (Padrão de OD $\ge 5.0\text{ mg/L}$ para águas marinhas Classe 1).
2. **LEÃO, Z. M. A. N.; KIKUCHI, R. K. P.; OLIVEIRA, M. D. M.** Branqueamento de corais nos recifes da Bahia e sua relação com anomalias térmicas. *Revista Brasileira de Geofísica*, v. 26, n. 4, p. 507-516, 2008.
3. **NOAA Coral Reef Watch.** Operational 5-km Satellite Coral Bleaching Heat Stress Monitoring Products (DHW, Bleaching Alert Levels). National Oceanic and Atmospheric Administration, 2024.
4. **CIRANO, M.; LESSA, G. C.** Oceanographic characteristics of Baía de Todos os Santos, Brazil. *Continental Shelf Research*, v. 27, p. 1420-1437, 2007.
5. **TRINDADE, B. S. et al.** Abundância e distribuição de microplásticos em estuários da Baía de Todos-os-Santos. *Marine Pollution Bulletin*, 2023.
6. **MAY, L. et al.** Sublethal cellular and physiological stress responses in tropical corals exposed to water-accommodated fractions of petroleum hydrocarbons. *Aquatic Toxicology*, 2020.
7. **WEISS, R. F.** The solubility of nitrogen, oxygen and argon in water and seawater. *Deep Sea Research and Oceanographic Abstracts*, v. 17, n. 4, p. 721-735, 1970.
8. **IBGE.** Malha Municipal e Divisão Político-Administrativa do Brasil. Instituto Brasileiro de Geografia e Estatística, Diretoria de Geociências, 2025.
