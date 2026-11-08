# Fontes de Dados Locais da Baía de Todos-os-Santos (BTS)

Este documento registra o inventário e o estado de avaliação das fontes de dados ambientais, oceanográficos e de qualidade de água da Baía de Todos-os-Santos (BTS), em conformidade com as diretrizes científicas do projeto **Kirimurê**.

---

## 1. Classificação de Status das Fontes

Cada fonte local é classificada estritamente segundo os 5 estágios de maturidade de dados:

1. **Encontrado**: Referência, publicação ou portal identificado publicamente.
2. **Acessado**: Documento, artigo ou portal aberto consultado pela equipe.
3. **Extraído**: Séries tabulares ou parâmetros numéricos digitalizados e estruturados.
4. **Validado**: Metadados (estações, profundidades, incertezas, calibrações) auditados e confirmados.
5. **Licença/Autorização Confirmada**: Termos de uso, atribuição ou licença de reutilização conferidos.

---

## 2. Inventário de Fontes Locais da BTS

### 2.1. Estudo de Oxigênio Dissolvido de Alta Frequência — UFBA (2019–2024)
- **Instituição:** Universidade Federal da Bahia (UFBA) — Instituto de Geociências / Oceanografia.
- **Trabalho:** Trabalho de Conclusão de Curso / Pesquisa de Monitoramento Contínuo: *Estudo de variabilidade temporal do oxigênio dissolvido na Baía de Todos-os-Santos com CTD multiparamétrica (2019–2024)* (Ilana et al.).
- **URL Fonte:** `https://oceanografia.ufba.br/TCC_Ilana_Vfinal.pdf`
- **Status do Pipeline:**
  - [x] **Encontrado**: Resumo acadêmico localizado.
  - [x] **Acessado**: Resumo e conclusões principais examinados.
  - [ ] **Extraído**: *Pendente de extração tabular integral dos dados brutos das 5 estações.*
  - [ ] **Validado**: *Pendente de confirmação das coordenadas geográficas exatas de cada estação, profundidades das séries temporais e calibração dos sensores ópticos/eletroquímicos.*
  - [ ] **Licença/Autorização**: *Pendente de autorização formal dos autores para redistribuição pública como dataset aberto.*
- **Parâmetros e Observações Documentadas:**
  - Faixa de OD reportada no resumo: **$4,03$ a $7,25\text{ mg/L}$**.
  - Cinco estações de monitoramento ao longo da baía em diferentes profundidades.
  - Associações estatísticas observadas:
    - Correlação positiva de OD com maré e com biomassa fitoplanctônica (clorofila-a);
    - Correlação negativa de OD com temperatura da água;
    - Gradiente espacial: tendência de redução do OD próximo ao fundo em direção aos compartimentos estuarinos internos da baía;
    - Transporte hidrodinâmico de maré atuando na introdução de massas de água mais oxigenadas da plataforma continental externa para o interior recifal.
- **Diretriz de Uso no Kirimurê:**
  - A faixa $4,03 - 7,25\text{ mg/L}$ é tratada como **pista de validação local e referência empírica publicada**, e **não** como faixa saudável universal estática.
  - Os valores não são injetados como parâmetros fixos antes da extração integral e validação dos metadados das 5 estações.

---

### 2.2. Monitoramento de Qualidade das Águas — INEMA / Sistema SEIA
- **Instituição:** Instituto do Meio Ambiente e Recursos Hídricos da Bahia (INEMA).
- **Programa:** Programa MONITORA (lançado em 2007, coletas operacionais sistemáticas desde 2008).
- **Portais Oficiais:**
  - Qualidade das Águas: `https://www.ba.gov.br/inema/iniciativas/qualidade-das-aguas-0`
  - Portal de Monitoramento SEIA: `https://monitoramento.seia.ba.gov.br/login.xhtml`
- **Status do Pipeline:**
  - [x] **Encontrado**: Portais e descrições do programa identificados.
  - [ ] **Acessado**: *O portal SEIA de monitoramento exige autenticação (login/senha). Nenhuma credencial foi contornada.*
  - [ ] **Extraído**: *Não extraído.*
  - [ ] **Validado**: *Cobertura específica e frequência de estações marinhas na BTS ainda não confirmadas em API pública aberta.*
  - [ ] **Licença/Autorização**: *Pendente.*
- **Diretriz de Uso no Kirimurê:**
  - **Não inventar** endpoints de API REST, nem arquivos CSV fictícios ou credenciais não autorizadas.
  - Declarar honestamente que a base estadual do INEMA/SEIA foi mapeada, mas o acesso aberto automatizado ainda não é oferecido sem autenticação no portal.

---

### 2.3. Caracterização Físico-Oceanográfica da BTS — Cirano & Lessa (2007)
- **Referência:** Cirano, M. & Lessa, G. C. (2007). *Oceanographic characteristics of Baía de Todos os Santos, Brazil*. Revista Brasileira de Geofísica, 25(4), 363–387. DOI: `10.1590/S0102-261X2007000400002`.
- **Status do Pipeline:**
  - [x] **Encontrado**: Artigo indexado no SciELO.
  - [x] **Acessado**: Texto integral e tabelas analisados.
  - [x] **Extraído**: Área, profundidade média, condições hidrográficas e tempo de descarga sazonal da BTS.
  - [x] **Validado**: Referência clássica revisada por pares da oceanografia física da BTS.
  - [x] **Licença/Autorização**: Artigo de acesso aberto (CC-BY).
- **Parâmetros Extraídos e Utilizados no Modelo de Caixa:**
  - Área total da baía: $\approx 1.223\text{ km}^2$.
  - Profundidade média batimétrica: $9,8\text{ m}$.
  - Parametrização vigente do modelo de caixas (hipóteses didáticas, não valores extraídos diretamente do artigo):
    - **Ilha dos Frades / Recifes Centrais:** $V = 3,2 \times 10^7\text{ m}^3$, profundidade representativa $H = 8,0\text{ m}$, $\tau = 38\text{ dias}$ (borda inferior do tempo publicado para a BTS; faixa sazonal $38$–$62$ dias).
    - **Estuário do Paraguaçu:** $V = 1,5 \times 10^7\text{ m}^3$, profundidade representativa $H = 5,0\text{ m}$, $\tau = 75\text{ dias}$ (hipótese de alta retenção).
    - **Canal da Barra / Oceânico:** $V = 1,0 \times 10^8\text{ m}^3$, profundidade representativa $H = 25,0\text{ m}$, $\tau = 9\text{ dias}$ (hipótese de rápida troca oceânica).
  - Variação sazonal de salinidade: de $\approx 32,3\text{ PSU}$ (período chuvoso com alta descarga fluvial) até $> 36,0\text{ PSU}$ (período seco / verão com penetração oceânica).
- **Diretriz de Uso no Kirimurê:**
  - Utilizado como **base morfométrica e hidrodinâmica de referência do modelo de caixa**, com limitação explícita de representar condições médias históricas e não medições meteorológicas instantâneas do dia atual.

---

### 2.4. Amostragem In-situ de Microplásticos em Estuários da BTS — Trindade et al. (2023)
- **Referência:** Trindade et al. (2023). *Microplastics contamination in estuaries of Todos os Santos Bay, Brazil*. Environmental Pollution, v. 323, 121224. DOI: `10.1016/j.envpol.2023.121224`.
- **Status do Pipeline:**
  - [x] **Encontrado**: Artigo científico internacional indexado.
  - [x] **Acessado**: Artigo completo e suplementos examinados.
  - [x] **Extraído**: Médias, máximos e frações granulométricas dos 4 principais estuários digitalizados.
  - [x] **Validado**: Metodologia com redes de plâncton de malhas $64\text{ }\mu\text{m}$ e $300\text{ }\mu\text{m}$ validada.
  - [x] **Licença/Autorização**: Uso educacional devidamente citado e atribuído à publicação.
- **Parâmetros Utilizados:**
  - Preservados estritamente na unidade empírica de medição: $\text{itens/m}^3$ de água superficial (até aproximadamente $33.000\text{ itens/m}^3$ no resumo publicado).
  - Médias e faixas exatas por rio não são apresentadas no produto sem a tabela ou suplemento rastreável do artigo.
  - Nenhuma conversão artificial para massa em kg é efetuada no Kirimurê, respeitando a ausência de amostragem gravimétrica contínua.

---

## 3. Matriz de Prioridades para Próximos Passos de Pesquisa Local

| Prioridade | Parâmetro | Fonte | Ação Necessária |
|---|---|---|---|
| **P0** | Séries temporais de OD, T e S (5 estações) | UFBA (Ilana et al.) | Obter PDF integral e contatar autores para acesso ao dataset bruto anonimizado por estação e profundidade. |
| **P0** | Coordenadas exatas das 5 estações | UFBA | Mapear latitude/longitude para confrontar com a grade de setores da BTS. |
| **P1** | Séries históricas de monitoramento marinho | INEMA | Acompanhar abertura de dados do portal SEIA ou solicitar dados via Lei de Acesso à Informação (LAI). |
| **P1** | Séries de maré e nível do mar | DHN / CHM / Estações maregráficas | Integrar tábua de marés oficial de Salvador (Porto de Salvador / Ponta da Armação). |
| **P2** | Clorofila-a e nutrientes in-situ | UFBA / Literatura | Mapear concentrações de nitrato, fosfato e amônia por bacia estuarina. |
