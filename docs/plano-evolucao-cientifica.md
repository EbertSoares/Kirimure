# Kirimurê — Plano de Evolução Científica e Refinamento Oceanográfico
**Versão:** 2.0 (Pós-Auditoria de Rigor Científico)  
**Data:** 24 de outubro de 2026  
**Status:** Especificação Arquitetural e Metodológica Consolidada  
**Classificação:** Documento de Governança Epistemológica e Modelagem Bioquímica  

---

## 1. Estrutura de Governança Epistemológica

O Kirimurê adota uma separação rigorosa entre dados observados em campo, saídas de modelos numéricos, definições operacionais globais, parâmetros pedagógicos e regras internas de software. 

### 1.1 A Taxonomia dos 5 Selos de Conhecimento

Toda variável, card, gráfico ou mensagem do sistema passa a carregar um dos cinco selos epistemológicos:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    TAXONOMIA EPISTEMOLÓGICA DO KIRIMURÊ                      │
├───────────────────────┬──────────────────────────────────────────────────────┤
│ [Dado Local BTS]      │ Medição empírica in situ na BTS publicada em artigo. │
│ [Produto de Modelo]   │ Satélite, reanálise ou hidrodinâmica (Copernicus/CRW)│
│ [Padrão Operacional]  │ Metodologia internacional consagrada (ex.: NOAA CRW) │
│ [Cenário Didático]    │ Valor parametrizado para viabilizar o uso em aula.   │
│ [Regra do Modelo]     │ Equação, normalização ou índice do código do app.    │
└───────────────────────┴──────────────────────────────────────────────────────┘
```

1. **`[Dado Local BTS]`**: Medições físicas, químicas ou biológicas realizadas em campanhas de campo na Baía de Todos-os-Santos com desenho amostral publicado.  
   *Exemplo:* abundância estuarina de até aproximadamente 33.000 itens/m³ de microplásticos (*Trindade et al., 2023*); tempo de descarga da BTS de 38 dias no inverno, com aumento de 60% no verão (*Cirano & Lessa, 2007*).
2. **`[Produto de Modelo]`**: Dados derivados de sensoriamento remoto por satélite, reanálise climática ou modelos numéricos oceânicos (ex.: Copernicus Marine Service, SST multissensor NOAA CoralTemp 5km, batimetria CHM/Marinha). Carregam resolução e incerteza de produto.
3. **`[Padrão Operacional]`**: Convenções e índices oficiais de monitoramento ambiental internacional.  
   *Exemplo:* Definição de HotSpot ($SST - MMM$), acúmulo de DHW em 84 dias para $HS \ge 1{,}0\text{ °C}$ (*NOAA Coral Reef Watch*); escala de saturação de aragonita.
4. **`[Cenário Didático]`**: Simplificações deliberadas e explicitadas para permitir a experimentação na sala de aula.  
   *Exemplo:* Fixar a MMM didática em 28,0 °C; faixas de lançamento de cargas em quilogramas/toneladas; fatores de aceleração temporal (1× a 10×).
5. **`[Regra do Modelo]`**: Formulações matemáticas, decaimentos de primeira ordem, normalizações de 0 a 100 e aproximações de caixa implementadas no código. Não têm equivalência direta a medições ecológicas de campo.

### 1.2 Schema de Metadados por Variável
Nenhum valor numérico flutua desacompanhado na interface científica. Todo indicador deve expor:
* **Nome e Símbolo:** ex.: Oxigênio Dissolvido ($OD$).
* **Unidade Físico-Química:** ex.: $\text{mg O}_2/\text{L}$ ou $\mu\text{mol/L}$ (nunca intercambiáveis sem estequiometria).
* **Origem / Selo:** um dos 5 selos acima.
* **Resolução & Incerteza:** ex.: $\pm 0{,}2\text{ mg/L}$; resolução temporal de 0,1 dia.
* **Escopo de Validade:** recife de franja abrigado vs. estuário vs. água oceânica aberta.

---

## 2. Matriz de Rastreabilidade Científica do Kirimurê

| Variável / Parâmetro | Valor no App | Unidade | Origem da Referência | Selo Epistemológico | Nível de Confiança | Ação / Papel no Simulador |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MMM Didática** | $28{,}0$ | °C | Climatologia aproximada BTS | `[Cenário Didático]` | Média | Referência base para cálculo do HotSpot no cenário. |
| **HotSpot Positivo** | $SST > 28{,}0$ | °C | NOAA CRW | `[Padrão Operacional]` | Alta | Anomalia positiva (primeiro valor visível: $28{,}1\text{ °C}$ na resolução de 0,1 °C). |
| **Limiar Acúmulo DHW** | $\ge 29{,}0$ | °C | NOAA CRW ($MMM + 1{,}0$) | `[Padrão Operacional]` | Alta | Condição necessária para entrar na soma diária de °C-semanas. |
| **Risco Térmico 4 DHW** | $4{,}0$ | °C-semana | NOAA CRW Alert Level 1 | `[Padrão Operacional]` | Alta | Categoria de risco de branqueamento em espécies sensíveis. |
| **Risco Térmico 8 DHW** | $8{,}0$ | °C-semana | NOAA CRW Alert Level 2 | `[Padrão Operacional]` | Alta | Risco de branqueamento em escala de recife e mortalidade em espécies vulneráveis. |
| **pH Baseline** | $8{,}10$ | Escala total | Média da superfície oceânica | `[Cenário Didático]` | Média | Referência didática; acidificação reduz o estado de saturação de aragonita. |
| **$\tau$ Central (Frades/Itaparica)** | $38\text{ a }62$ | dias | Cirano & Lessa (2007) | `[Dado Local BTS]` | Média | Faixa sazonal de renovação hidrodinâmica (inverno–verão). |
| **$\tau$ Estuarino (Paraguaçu)** | $\approx 75$ | dias | Estimativa provisória | `[Cenário Didático]` | Baixa | Provisório para fins pedagógicos de alta retenção; não validado in situ. |
| **$\tau$ Oceânico (Barra)** | $\approx 8\text{–}12$ | dias | Estimativa provisória | `[Cenário Didático]` | Baixa | Provisório para fins pedagógicos de alta dispersão; não validado in situ. |
| **Microplásticos** | até $\approx 33.000$ | itens/$\text{m}^3$ | Trindade et al. (2023) | `[Dado Local BTS]` | Alta para o teto aproximado publicado | Exibido no contexto estuarino; valores intermediários do controle são didáticos e não são convertidos para massa. |
| **Toxicidade Óleo (tPAH50)** | $10\text{ e }27$ | $\mu\text{g/L}$ | May et al. (2020) | `[Dado de Laboratório]` | Alta | Endpoints subletais (regeneração e retração de pólipos em 96h); não é dose letal. |
| **OD de Saturação ($OD_{\text{sat}}$)** | $6{,}55$ | $\text{mg O}_2/\text{L}$ | Equação de Weiss (26,8 °C, 35 PSU) | `[Produto de Modelo]` | Alta para a equação; condições locais são cenário | Saturação de equilíbrio ar-mar tropical. |
| **Índice de Estabilidade** | $0\text{ a }100$ | % | Algoritmo do motor Kirimurê | `[Regra do Modelo]` | N/A (didático) | Mede a perda de resiliência interna do cenário; não é mortalidade real de campo. |

---

## 3. Dinâmica Bioquímica de Oxigênio e Eutrofização

A decomposição de matéria orgânica não causa dano "mágico" instantâneo: ela alimenta bactérias heterotróficas que respiram oxigênio dissolvido. O modelo físico-químico deve garantir **estrita consistência dimensional**.

### 3.1 Equações Diferenciais Acopladas (Base $\text{mg O}_2/\text{L/dia}$)

A dinâmica é modelada como um sistema de duas variáveis de estado acopladas: a concentração de matéria orgânica biodegradável no compartimento ($[DBO]$, em $\text{mg O}_2/\text{L}$) e o Oxigênio Dissolvido ($[OD]$, em $\text{mg O}_2/\text{L}$):

$$\begin{cases}
\dfrac{d[DBO]}{dt} = \underbrace{\dfrac{L_{\text{entrada}}(t)}{V}}_{\text{Aporte (mg/L/dia)}} - \underbrace{k_d \cdot [DBO]}_{\text{Oxidação bacteriana}} - \underbrace{\dfrac{[DBO]}{\tau}}_{\text{Exportação hidrodinâmica}} \\[12pt]
\dfrac{d[OD]}{dt} = \underbrace{k_a(W, T) \cdot (OD_{\text{sat}}(T, S) - [OD])}_{\text{Reaeração superficial}} - \underbrace{Y \cdot k_d \cdot [DBO]}_{\text{Demanda bacteriana}} + \underbrace{(P(I, \text{cloro}) - R(T))}_{\text{Metabolismo do ecossistema}}
\end{cases}$$

Onde:
* **$[DBO]$:** Concentração de demanda bioquímica remanescente ($\text{mg O}_2/\text{L}$).
* **$L_{\text{entrada}}(t) / V$:** Carga diária introduzida diluída no volume de mistura do cenário ($\text{mg O}_2/\text{L/dia}$).
* **$k_d$:** Coeficiente cinético de desoxigenação ($0{,}10\text{ a }0{,}15\text{ dia}^{-1}$ a 20 °C, ajustado por $k_d(T) = k_{20} \cdot 1{,}047^{T - 20}$).
* **$Y$:** Razão de consumo estequiométrico ($Y = 1{,}0$ por definição da DBO expressa em $\text{O}_2$ equivalente).
* **$\tau$:** Tempo de retenção hidráulica do compartimento ($\text{dias}$).
* **$k_a(W, T)$:** Taxa de reaeração superficial, dependente do vento $W$ e profundidade $H$:
  $$k_a \approx \frac{0{,}728 \cdot W^{0{,}5} - 0{,}317 \cdot W + 0{,}0372 \cdot W^2}{H} \cdot 1{,}024^{T - 20} \quad (\text{dia}^{-1})$$
  *(No cenário didático com vento de $4\text{ m/s}$, temperatura de $26{,}8\text{ °C}$ e profundidade de $5\text{ m}$, a própria equação fornece $k_a \approx 0{,}18\text{ dia}^{-1}$).*
* **$OD_{\text{sat}}(T, S)$:** Concentração de saturação segundo a fórmula de Weiss (1970):
  $$OD_{\text{sat}}(26{,}8\text{ °C}, 35\text{ PSU}) \approx 6{,}55\text{ mg/L}$$
* **$P - R$ (Balanço Fotossíntese/Respiração):**
  * Durante o dia com águas claras: $P > R$ (pequeno aporte líquido de $\approx +0{,}3\text{ a }+0{,}6\text{ mg/L/dia}$).
  * Sob alta turbidez ou películas de óleo: $P \to 0$, tornando o saldo puramente respiratório ($R \approx 0{,}4\text{ mg/L/dia}$).

### 3.2 Categorias de Oxigênio Cientificamente Rigorosas

A auditoria corrigiu com propriedade a terminologia de anóxia e as respostas de organismos:

| Faixa de OD | Classificação Limnológica/Oceanográfica | Resposta Biológica Esperada (Hipótese de Modelo) |
| :--- | :--- | :--- |
| **$> 5{,}0\text{ mg/L}$** | **Normóxia / Condição Adequada** | Faixa geralmente recomendada para manutenção da ictiofauna e calcificação recifal plena. |
| **$3{,}0 - 5{,}0\text{ mg/L}$** | **Estresse Respiratório Potencial** | Redução da atividade motora e metabólica; dependente da espécie, temperatura e tempo de exposição. |
| **$2{,}0 - 3{,}0\text{ mg/L}$** | **Hipóxia** | Fuga ativa de espécies nectônicas; peixes sensíveis podem apresentar estresse severo e perda de equilíbrio. |
| **$< 2{,}0\text{ mg/L}$** | **Hipóxia Severa** | Risco crítico de mortalidade de peixes por asfixia sob exposição sustentada; retração profunda de pólipos de corais. |
| **$\approx 0{,}0\text{ mg/L}$** | **Anóxia** | Ausência de oxigênio livre; colapso biológico agudo, sobrevivência restrita a organismos anaeróbios. |

> **Nota Epistemológica:** O simulador não afirma que "o Cirurgião-patela morre exatamente em 2,5 mg/L", mas que peixes sensíveis entram em estresse progressivo conforme o oxigênio decai em direção à hipóxia severa.

---

## 4. Ecotoxicologia do Óleo em 4 Compartimentos Físicos

O petróleo não é uma entidade monolítica que apenas escurece a água. O Kirimurê separa conceitualmente quatro destinos:

```
                          DERRAMAMENTO DE ÓLEO
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
[1. Filme Superficial]     [2. Gotículas Dispersas]     [3. HPAs Dissolvidos]
Óleo flutuante             HEWAF na coluna d'água       Fração biodisponível
• Atenua a luz PAR         • Adere às brânquias         • Estresse químico crônico
• Bloqueia reaeração ar-mar • Ingestão por filtradores   • Inibição celular (EC50)
• Reduz a fotossíntese     • Mistura por ondas          • Toxicidade de 10-27 µg/L
                                                        (May et al., 2020)
```
*(Um quarto compartimento, o **óleo sedimentado no fundo**, atua na adsorção e soterramento bentônico a longo prazo).*

A resposta visual e biológica é desacoplada:
* **Efeito Óptico:** Controlado pela área da mancha superficial ($env.oil$).
* **Efeito Tóxico Subletal:** Controlado pela dose acumulada e persistência hidrodinâmica dos compostos policíclicos aromáticos (tPAH).

---

## 5. Compartimentação Espacial com Intervalos de Incerteza

Para respeitar a literatura oceanográfica, os 3 setores são apresentados com faixas de incerteza e selos transparentes:

### Setor A: Recifes Centrais (Ilha dos Frades & Itaparica)
* **Selo:** `[Dado Local BTS]` para hidrodinâmica; `[Cenário Didático]` para espécies representadas.
* **Hidrodinâmica:** $\tau = 38\text{ a }62\text{ dias}$ (*Cirano & Lessa, 2007*).
* **Salinidade:** $34{,}5\text{–}36{,}0\text{ PSU}$.
* **Profundidade Média:** $6\text{–}12\text{ m}$.
* **Vulnerabilidade:** Alerta de aquecimento térmico (DHW) e impacto de efluentes em enseadas abrigadas.

### Setor B: Estuário do Rio Paraguaçu (Fundo da Baía / Maragogipe)
* **Selo:** `[Cenário Didático / Parâmetro Provisório]`.
* **Hidrodinâmica:** $\tau_{\text{estimado}} \approx 60\text{–}90\text{ dias}$ *(tempo prolongado de descarga estuarina sob baixa vazão)*.
* **Salinidade:** $15{,}0\text{–}28{,}0\text{ PSU}$ *(estuário com gradiente de água doce)*.
* **Profundidade Média:** $3\text{–}7\text{ m}$.
* **Vulnerabilidade:** Altíssima sensibilidade a DBO/esgoto (risco rápido de hipóxia severa devido à circulação lenta e águas rasas).

### Setor C: Boca da Baía / Barra (Canal de Salvador)
* **Selo:** `[Cenário Didático / Parâmetro Provisório]`.
* **Hidrodinâmica:** $\tau_{\text{estimado}} \approx 6\text{–}14\text{ dias}$ *(troca enérgica com a Corrente do Brasil)*.
* **Salinidade:** $36{,}0\text{–}37{,}0\text{ PSU}$ *(marinha oceânica)*.
* **Profundidade Média:** $15\text{–}40\text{ m}$.
* **Vulnerabilidade:** Baixa retenção de contaminantes solúveis; rápida depuração e diluição oceânica.

---

## 6. Dinâmica de Resiliência e Recuperação Ecológica

Um modelo biológico defensável não pode ser apenas um gerador unidirecional de colapso. O Kirimurê formaliza o ciclo completo de resiliência:

1. **Recuperação de Oxigênio (Despoluição):** Cessada a carga de DBO, a reaeração atmosférica ($k_a$) e a exportação ($\tau$) restabelecem o oxigênio para $> 6{,}5\text{ mg/L}$ no ritmo de $1 - e^{-t/\tau}$.
2. **Alívio Térmico:** Quando a temperatura retorna para $\le 28{,}0\text{ °C}$, os HotSpots zeram imediatamente. O DHW permanece em decaimento até que os dias quentes saiam da janela móvel de 84 dias.
3. **Regeneração Coralina e Repovoamento de Peixes:**
   * Se o estresse total cair abaixo do limiar de recuperação ($\text{stress} < 0{,}10$), a saúde dos corais e peixes recupera-se a uma taxa proporcional a $(1 - \text{stress}) \times (100 / \text{collapseDays}) / 5$.
   * Ações de recuperação ambiental (Unidades de Conservação e restauração) elevam o limiar de tolerância e aceleram a taxa regenerativa em até 3×.

---

## 7. Estrutura Temporal do Projeto

* **Seção A (Implementado no MVP Atual):**
  * Motor 3D Babylon.js não-bloqueante;
  * Mecânica de DHW em janela de 12 semanas para $HS \ge 1{,}0\text{ °C}$;
  * Escala logarítmica de pH;
  * Modelo de caixa exponencial de primeira ordem ($e^{-t/\tau}$);
  * Diorama 3D com cardumes de peixe-cirurgião, sargentinho e peixe-papagaio;
  * Estimativa didática inicial de Oxigênio Dissolvido.

* **Seção B (Aprovado para Implementação Imediata - Próxima Etapa):**
  * Integração dos 5 selos epistemológicos na interface (`EvidenceDrawer`, tooltips e indicadores);
  * Correção do texto de HotSpot ($SST > 28{,}0\text{ °C}$; exibido em $28{,}1\text{ °C}$ na resolução da tela);
  * Correção das categorias de oxigênio (troca de "anóxia" por "hipóxia severa" para $< 2\text{ mg/L}$);
  * Inclusão do Oxigênio Dissolvido na leitura principal e no painel de indicadores;
  * Substituição de "crítico em ~X dias" por "limite de tolerância do cenário sob exposição constante";
  * Reformulação do esgoto como DBO₅ (O₂ equivalente).

* **Seção C (Hipóteses e Pesquisas Futuras para Versão Avançada):**
  * Acoplamento com grade espacial 2D/3D (advecção-difusão);
  * Validação com transectos de campo do SiBBr/OBIS para composição bentônica na Ilha dos Frades;
  * Cálculo dinâmico do sistema de carbonato (DIC e Alcalinidade Total via CO2SYS simplificado).
