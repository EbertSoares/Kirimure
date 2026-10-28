# Kirimurê — Plano Pedagógico, Design de Experiência e Arquitetura de Investigação

> **Status:** Documento Estratégico Consolidado de Planejamento e Especificação da Missão 01  
> **Fundamentação:** Síntese de *Sandbox Universe* + *Plague Inc.* + *UNESCO Ocean Literacy* + *NOAA Environmental Literacy*  
> **Território de Referência:** Baía de Todos-os-Santos (BTS), Bahia, Brasil  
> **Público Prioritário:** Ensino Fundamental II (6º ao 9º ano / 11 a 14 anos)  
> **Alinhamento Curricular:** BNCC Ciências da Natureza (Habilidades EF06CI07, EF07CI08, EF09CI13) & Diretrizes do Currículo Azul (UNESCO/COI)

---

## 1. Visão Estratégica: Da Simulação Passiva à Investigação Científica

### 1.1 O Diagnóstico Central
Um simulador oceânico 3D com computação gráfica apurada corre um risco pedagógico fatal: **ser visualmente impressionante nos primeiros 5 minutos, mas rapidamente esquecido** caso o estudante atue apenas como espectador passivo de animações ou como um causador inconsequente de desastres ecológicos.

Se o objetivo do Kirimurê é transformar a **Cultura Oceânica** nas escolas, a pergunta norteadora do produto não é:
> *"Como exibimos a poluição marinha na tela?"*

Mas sim:
> *"Como capacitamos o aluno a raciocinar cientificamente, formular hipóteses, investigar relações causais e tomar decisões responsáveis sobre a relação entre a sociedade e o oceano?"*

### 1.2 Transição de Paradigma

| Dimensão | Simulador Comum (Passivo) | Laboratório Kirimurê (Investigação Ativa) |
|---|---|---|
| **Papel do Aluno** | Espectador / "Jogador de Destruição" | Investigador Científico / Tomador de Decisão |
| **Ação Central** | Mexe em sliders e vê peixes morrerem | Seleciona hipótese, isola uma variável e testa intervenções |
| **Resposta Visual** | Efeito gráfico cosmético (água fica verde) | Manifestação visual de um mecanismo biogeoquímico real |
| **Compreensão** | Memoriza o slogan superficial ("poluição faz mal") | Compreende a cadeia causal exata da respiração e oxigenação |
| **Papel do Professor** | Precisa inventar a aula e decifrar o software sozinho | Conduz uma experiência estruturada com plano de aula de 45–50 min |
| **Impacto Real** | Entretenimento efêmero em tela | Capacidade de transferir o raciocínio para problemas da sua comunidade |

---

## 2. Síntese dos Modelos de Referência (O Melhor de Cada Mundo)

O Kirimurê combina a liberdade espacial e a causalidade física dos simuladores *sandbox* com o rigor de indicadores, a progressão temporal e a tomada de decisão estratégica dos simuladores de sistemas complexos, sustentado pela pedagogia investigativa da NOAA e da UNESCO.

```
                  ┌──────────────────────────────────────────────┐
                  │           KIRIMURÊ DIGITAL LAB               │
                  │   Laboratório de Investigação Oceânica       │
                  └──────────────────────┬───────────────────────┘
                                         │
         ┌───────────────────────────────┼──────────────────────────────┐
         ▼                               ▼                              ▼
┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐
│ SANDBOX UNIVERSE │           │   PLAGUE INC.    │           │  UNESCO / NOAA   │
│ Liberdade & 3D   │           │ Sistemas & Tempo │           │ Cultura Oceânica │
├──────────────────┤           ├──────────────────┤           ├──────────────────┤
│• Câmera guiada 3D│           │• Ciclo de decisão│           │• Compreender     │
│• Objeto-Propried.│           │• Revelação progr.│           │• Investigar      │
│• Tempo acelerável│           │• Notícias/Marcos │           │• Agir            │
│• Cenários + Livre│           │• "The Cure" (rec)│           │• Contexto local  │
└──────────────────┘           └──────────────────┘           └──────────────────┘
```

### 2.1 O que extraímos do *Sandbox Universe*
1. **Padrão de Interação Fundamental:**
   $$\text{Objeto / Fator} \longrightarrow \text{Parâmetros Reais} \longrightarrow \text{Simulação Físico-Química} \longrightarrow \text{Consequências Observáveis}$$
2. **Câmera 3D Estável e Guiada (Sem Desorientar o Aluno):** Diferente de um simulador espacial com eixos infinitos que pode fazer o aluno do 6º ano se perder olhando para o nada, o Kirimurê utiliza enquadramento semi-guiado *over-under* (meia-água), exibindo a superfície e o fundo marinho simultaneamente com clareza visual.
3. **Controle Temporal:** Avançar o tempo com taxas graduais (1×, 2×, 5×, 10×) para tornar perceptíveis processos de curto prazo (depleção de oxigênio em dias) e processos cumulativos (depuração hidrodinâmica em semanas).
4. **Dualidade Estruturada vs. Livre:** Oferecer missões com roteiro fechado para a aula de 45 minutos e um modo *Sandbox Livre* para exploração autônoma pós-aula.

### 2.2 O que extraímos de *Plague Inc.* e *Plague Inc: The Cure*
1. **Ciclo de Tomada de Decisão em Sistemas Complexos:**
   $$\text{Observar Cenário} \longrightarrow \text{Escolher Alteração/Intervenção} \longrightarrow \text{Avançar Relógio} \longrightarrow \text{Analisar Evidências e Reagir}$$
2. **Divulgação Progressiva (*Progressive Disclosure*):**
   - Não despejar 40 variáveis simultâneas na tela.
   - Agrupar decisões em 3 categorias conceituais: **Fontes de Pressão** (causa), **Indicadores Ecológicos** (impacto) e **Respostas Humanas** (soluções/saneamento).
3. **Eventos e Marcos Contextuais:** Alertas educativos que disparam não por tempo arbitrário, mas quando o sistema atinge limiares críticos cientificamente fundamentados (ex.: hipóxia severa em peixes).
4. **O Paradoxo da Recuperação ("The Cure"):**
   - O caminho de volta não é instantâneo: cessar uma carga de esgoto não restaura a vida aquática no segundo seguinte.
   - Ensinar a inércia biogeoquímica e o tempo de residência das águas estuarinas.

---

## 3. Arquitetura da Experiência Pedagógica (Os 3 Atos da Aula de 45 Min)

Para garantir que o professor consiga aplicar o Kirimurê dentro da grade curricular real, a experiência é dividida em três atos sequenciais:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FLUXO DA MISSÃO CIENTÍFICA                            │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│    1. COMPREENDER    │    2. INVESTIGAR     │            3. AGIR            │
│      (10 min)        │       (25 min)       │           (10 min)            │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│• Observar o ecossis- │• Seleção de hipótese │• Comparar intervenções        │
│  tema saudável.      │  guiada (3 opções).  │  reais (saneamento na fonte). │
│• Conhecer os valores │• Isolamento de uma   │• Avaliar tempo de resposta    │
│  normais de oxigênio.│  única variável.     │  hidrodinâmico e custos.      │
│• Reconhecer fauna    │• Avançar o tempo e   │• Defender conclusão baseada   │
│  nativa da BTS.      │  ler evidências.     │  em gráficos e dados reais.   │
└──────────────────────┴──────────────────────┴───────────────────────────────┘
```

### 3.1 Ato 01: Compreender (O Ponto de Partida Saudável — 10 min)
- **Objetivo:** O estudante não pode compreender o impacto se não conhecer a referência saudável.
- **Atividade:** O aluno explora a enseada estuarina virgem, identifica espécies nativas da costa baiana (cirurgião-azul *Acanthurus chirurgus*, sargentinho *Abudefduf saxatilis*), inspeciona a água límpida e aprende que a baseline saudável possui oxigênio abundante ($OD \approx 6,5\text{ mg/L}$) e baixa carga orgânica.
- **Pergunta orientadora:** *"Do que este recife precisa para se manter vivo e sustentar a pesca local?"*

### 3.2 Ato 02: Investigar (O Ciclo da Hipótese Científica — 25 min)
- **Objetivo:** Desenvolver o pensamento hipotético-dedutivo sem frustração.
- **Acessibilidade na Hipótese (Sem Travamento):** Em vez de congelar a tela com redação obrigatória, o aluno conta com 3 vias:
  1. *Escolher:* Selecionar uma previsão entre 3 alternativas plausíveis baseadas no senso comum.
  2. *Explicar (Opcional):* Justificar a escolha com uma frase curta ou opções de apoio.
  3. *Investigar livremente:* No modo sandbox, testar primeiro e registrar conclusões no próprio ritmo.
- **Teste Controlado:** O aluno altera a carga de matéria orgânica, avança o tempo em dias e observa o gráfico de $OD$ declinar em sincronia com os sintomas comportamentais da fauna.
- **Confrontação com Evidências:** O sistema compara o que o aluno previu com o que o modelo calculou, revelando o mecanismo contraintuitivo (os peixes não morrem por toxina mágica, mas pela asfixia gerada pelas bactérias decompositoras).

### 3.3 Ato 03: Agir (Decisão Informada e Soluções Sem "Botão Mágico" — 10 min)
- **Objetivo:** Discutir soluções ambientais com maturidade e sem simplificações infantis.
- **Critérios de Decisão:** O aluno compara intervenções a partir de perguntas concretas:
  - *Qual causa a intervenção ataca?* (Tratamento de esgoto combate a fonte; aeradores locais apenas atenuam o sintoma).
  - *Quanto tempo leva para surtir efeito?* (A água da baía precisa de semanas para ser renovada pelas marés; a recuperação não é mágica).
  - *Quais limitações permanecem?* (Custo financeiro, necessidade de infraestrutura pública e governança municipal).

---

## 4. O Rigor Bioquímico: Dois Caminhos Causais Distintos do Esgoto

O Kirimurê evita um dos equívocos conceituais mais comuns em materiais didáticos: **dar a entender que todo esgoto precisa causar uma floração de algas verdes para derrubar o oxigênio**. 

Na natureza, existem duas vias biogeoquímicas diferentes:

```
                          ENTRADA DE EFLUENTE BRUTO
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
   [ CAMINHO 1: CARGA ORGÂNICA ]               [ CAMINHO 2: NUTRIENTES N e P ]
   Matéria Orgânica Dissolvida (DBO)           Nitrogênio e Fósforo Inorgânicos
           │                                                   │
           ▼ (Efeito Direto e Rápido)                          ▼ (Efeito Indireto e Lento)
Decomposição bacteriana heterotrófica         Proliferação acelerada de microalgas
imediata de compostos de carbono              (Floração / Eutrofização)
           │                                                   │
           ▼                                                   ▼
CONSUMO DIRETO DE OXIGÊNIO DISSOLVIDO         Morte e decantação da biomassa algal
           │                                                   │
           │                                                   ▼
           │                                  Decomposição bacteriana secundária
           │                                                   │
           └─────────────────────────┬─────────────────────────┘
                                     ▼
                      QUEDA CRÍTICA DO OXIGÊNIO (OD)
                                     │
                                     ▼
                    ESTRESSE RESPIRATÓRIO E HIPÓXIA
```

### 4.1 Caminho 1 — Carga Orgânica Direta (DBO)
- **Mecanismo:** Microrganismos decompositores consomem oxigênio dissolvido imediatamente para quebrar a matéria orgânica rica em carbono.
- **Escala de Tempo:** Horas a poucos dias.
- **Sintoma Visual:** Água turva, redução de transparência, odor simulado em avisos contextuais e declínio rápido do indicador de oxigênio.
- **Conceito Chave:** Não depende de algas. A água pode estar turva e cinzenta e já apresentar hipóxia severa.

### 4.2 Caminho 2 — Excesso de Nutrientes (Eutrofização)
- **Mecanismo:** Compostos inorgânicos de nitrogênio e fósforo atuam como fertilizantes para o fitoplâncton e macroalgas.
- **Escala de Tempo:** Vários dias a semanas (requer luz solar e tempo de multiplicação celular).
- **Sintoma Visual:** Aumento da tonalidade esverdeada/turva da coluna d'água, floração superficial e posterior senescência.
- **Conceito Chave:** O consumo crítico de oxigênio ocorre quando as algas morrem e apodrecem no fundo, e não enquanto estão vivas e realizando fotossíntese de dia.

---

## 5. Especificação Oficial do MVP: Missão 01 — O Mistério do Oxigênio

A primeira experiência de sala de aula é estruturada rigorosamente no **fluxo de 5 telas**, desenhado para uma aula de 45 minutos com alunos de 11 a 14 anos:

### Tela 1 — Conheça o Ambiente (Baseline)
- **Cena Visual:** Enseada estuarina da Baía de Todos-os-Santos em maré estável. Água translúcida, cardumes de cirurgiões-azuis e sargentinhos nadando ativamente em meia-água.
- **Indicadores Visíveis (Linguagem Escolar Clara):**
  - `Oxigênio na Água`: **6,5 mg/L** (Nível Excelente para respiração).
  - `Esgoto Lançado`: **Zero**.
  - `Saúde da Fauna`: **100%**.
- **Provocação do Professor / Voz do App:**  
  *"Os peixes precisam de oxigênio dissolvido na água para respirar pelas brânquias. Mas por que a chegada de esgoto doméstico comum pode fazer esse oxigênio sumir, mesmo que o esgoto não seja veneno químico?"*
- **Ação:** Botão *"Avançar para a Investigação"*.

### Tela 2 — Faça uma Previsão (Hipótese Guiada)
- **Problema:** Um novo canal despeja efluente orgânico contínuo nesta enseada. O que acontecerá nos próximos 15 dias?
- **Interface de Hipótese (Escolha Acessível com 1 Clique):**
  - [ ] **Opção A:** *O esgoto envenena os peixes por contato imediato em poucas horas.*
  - [ ] **Opção B:** *Bactérias consomem o oxigênio da água para digerir a matéria orgânica, asfixiando os peixes aos poucos.* (Hipótese cientificamente correta)
  - [ ] **Opção C:** *A poluição fica apenas na superfície e não afeta em nada a respiração dos peixes no fundo.*
- **Campo Opcional:** *"Quer justificar sua escolha com suas palavras? (Opcional)"*
- **Ação:** O aluno escolhe uma alternativa e clica em *"Testar no Laboratório"*. A hipótese fica gravada no topo para conferência posterior.

### Tela 3 — Teste e Observe (A Simulação Físico-Química)
- **Controle Único do Aluno:** Slider simplificado de `Carga Orgânica Lançada` (Baixa, Média, Alta).
- **Controle de Tempo:** Botão `Avançar Tempo` (Dias 1 a 15).
- **Sincronia Cena 3D vs. Gráficos:**
  - **Dias 1 a 3:** A água torna-se levemente turva. O oxigênio inicia queda gradual ($6,5 \rightarrow 4,8\text{ mg/L}$).
  - **Dias 5 a 8:** O oxigênio cruza o limiar crítico de estresse ($<3,0\text{ mg/L}$). Os peixes passam a nadar mais perto da superfície (comportamento de respiração em água superficial aerada) e mudam para textura estressada/pálida.
  - **Dias 10 a 15:** Hipóxia severa ($<2,0\text{ mg/L}$). O gráfico de oxigênio atinge a faixa vermelha e surgem perdas na população de peixes.
- **Gráfico Comparativo na Tela:** Linha do tempo mostrando $OD$ em queda sincronizada com o estresse dos peixes.

### Tela 4 — Investigue uma Solução (Intervenção Sem Botão Mágico)
- **Problema:** A enseada está hipóxica. O que a comunidade e a prefeitura local podem fazer?
- **Escolha de Intervenção:**
  - *Opção 1 — Aeradores Mecânicos Emergenciais:* Aumentam o oxigênio localmente, mas consomem muita energia e não resolvem a causa.
  - *Opção 2 — Estação de Tratamento de Esgoto (ETE):* Corta 90% da matéria orgânica lançada na bacia.
- **A Revelação da Inércia Hidrodinâmica:**
  - Ao ativar a ETE, o aluno descobre que **a água não fica limpa no dia seguinte**.
  - O relógio avança: são necessários de 15 a 30 dias para que as marés da Baía de Todos-os-Santos lavem o efluente residual e o oxigênio volte a subir ($>5,5\text{ mg/L}$), permitindo a recuperação gradual da fauna.

### Tela 5 — Explique o que Descobriu (Conclusão e Transferência)
- **Confronto Hipótese vs. Realidade:**
  - O sistema exibe o card da hipótese escolhida pelo aluno na Tela 2 ao lado dos dados observados.
  - Se escolheu a Opção B: *"Excelente previsão científica! Você comprovou que as bactérias consomem o oxigênio ao decompor a carga orgânica."*
  - Se escolheu A ou C: *"Você observou o que realmente aconteceu? Não houve veneno imediato nem separação mágica de camadas: o oxigênio foi consumido pela decomposição bacteriana."*
- **Pergunta de Transferência para a Vida Real:**  
  *"Em uma praia urbana de Salvador ou de sua cidade após uma chuva forte, você já viu a água ficar turva e escura perto de saídas de galerias? O que você explicaria para um amigo sobre o risco de nadar ou pescar ali nos dias seguintes?"*
- **Ação:** O aluno registra sua reflexão final e gera um resumo imprimível ou exportável para o professor.

---

## 6. Governança Científica e Desmistificação dos Números

Para evitar a ilusão de um "falso rigor universal", o Kirimurê adota diretrizes estritas sobre como os números são tratados na interface didática:

### 6.1 Os Números como Referências Didáticas, Não Axiomas Universais
- **Oxigênio Dissolvido ($OD$):**
  - $>5,0\text{ mg/L}$: Nível seguro e adequado para a maioria dos peixes marinhos tropicais.
  - $3,0$ a $5,0\text{ mg/L}$: Faixa de alerta e estresse metabólico moderado.
  - $<2,0\text{ mg/L}$: Hipóxia severa com risco agudo de letalidade respiratória.
  - *Ressalva explícita:* Espécies bentônicas ou estuarinas podem possuir tolerâncias distintas. O valor exibido é uma referência ecológica representativa.
- **Separação de Temas:** O estresse térmico de corais (DHW) e a acidificação (pH) **não aparecem na Missão 01**. Manter o foco limpo na respiração e decomposição orgânica.

### 6.2 Transparência dos Indicadores
Todo indicador exibido na interface possui:
1. **Nome Simples:** *Oxigênio na Água*.
2. **Valor com Unidade:** *6,5 mg/L*.
3. **Classificação Amigável:** *Nível Bom / Alerta / Crítico*.
4. **Card de Metadados (Ao Clicar):** Explicação da origem (medições da BTS / padrão US EPA) e indicação de que se trata de uma simplificação do modelo didático.

---

## 7. Critérios de Avaliação da Aprendizagem Escolar

Para demonstrar às escolas e secretarias de educação que o Kirimurê gera ganho pedagógico real, a avaliação é estruturada em 4 dimensões observáveis:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 RÉGUA DE AVALIAÇÃO DA CULTURA OCEÂNICA                      │
├─────────────────────────┬───────────────────────────────────────────────────┤
│ Dimensão                │ O que o aluno consegue demonstrar                 │
├─────────────────────────┼───────────────────────────────────────────────────┤
│ 1. Conhecimento Causal  │ Explica que a matéria orgânica alimenta bactérias │
│                         │ que consomem o oxigênio da água na decomposição.  │
├─────────────────────────┼───────────────────────────────────────────────────┤
│ 2. Previsão de Cenários │ Consegue antecipar que mais esgoto levará a menos │
│                         │ oxigênio após alguns dias, sem precisar de dicas. │
├─────────────────────────┼───────────────────────────────────────────────────┤
│ 3. Decisão Justificada  │ Compreende que tratar o esgoto na fonte é mais    │
│                         │ eficaz que remediar o mar, mas exige tempo.       │
├─────────────────────────┼───────────────────────────────────────────────────┤
│ 4. Retenção & Contexto  │ Semanas após a aula, relaciona o esgoto urbano    │
│                         │ de sua bacia hidrográfica à saúde da praia local. │
└─────────────────────────┴───────────────────────────────────────────────────┘
```

---

## 8. Diretrizes de Engenharia e Desempenho para Hardware Escolar Real

A viabilidade do Kirimurê depende da sua capacidade de rodar de forma fluida em ambientes escolares reais no Brasil (PCs de laboratório com gráficos integrados, Chromebooks e smartphones Android modestos).

Em vez de tratar a performance como uma promessa abstrata ("60 FPS em qualquer aparelho"), o projeto adota uma **postura de engenharia empírica**:
- **Linha de Base Homologada:** **30 FPS estáveis e contínuos** no perfil escolar mínimo (sem travamentos curtos de CPU/GC e sem superaquecimento em aulas de 45 min).
- **Meta Desejável:** 60 FPS nos dispositivos com capacidade de GPU e memória suficiente.
- **Linha de Base de Compatibilidade:** **WebGL2** é o padrão amplamente testado e garantido; WebGPU atua como aprimoramento progressivo em navegadores compatíveis.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 OS 3 PERFIS DE QUALIDADE (SELEÇÃO AUTOMÁTICA)               │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Perfil Escolar / Mobile:                                                 │
│    • DPR contido (teto ~1,3×–1,4× em telas densas, reduzindo fillrate).     │
│    • Sombras complexas desativadas ou simplificadas.                        │
│    • Malha 3D completa com esqueleto restrita a peixes no 1º plano.         │
│    • Orçamento inicial de partículas moderado (~80 a 120) a testar.         │
│    • Meta: 30 FPS estáveis, baixo consumo de bateria e aquecimento contido. │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. Perfil Padrão:                                                           │
│    • Resolução nativa em desktops/laptops comuns.                           │
│    • Maior densidade de fauna e efeitos moderados de água.                  │
│    • Meta: 30 a 60 FPS equilibrados.                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. Perfil Alta Capacidade:                                                  │
│    • Maior volume de partículas e efeitos avançados de pós-processamento,   │
│      sem alterar regras científicas ou conferir vantagens pedagógicas.      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.1 Otimizações Medidas em Dispositivos Reais
1. **Redução de Fillrate (Capping de DPR):**
   - Em telas móveis de alta densidade ($DPR \ge 2,5$), renderizar com teto em $1,3\times$ a $1,4\times$ reduz significativamente os pixels internos processados. 
   - *Ressalva de engenharia:* Essa medida alivia a GPU, mas não elimina gargalos de CPU, memória ou shaders mal otimizados. Cada ajuste deve ser medido em aparelhos físicos.
2. **LOD e Cardumes Adaptados:**
   - O uso de `thinInstances` no Babylon.js é uma excelente ferramenta para instanciamento em massa, mas exige simplificação de animação e materiais. Peixes com esqueletos complexos e deformação de malha ficam restritos a poucos indivíduos em destaque próximo à câmera.
3. **Throttling em Ociosidade:**
   - Durante pausas da simulação (momentos de leitura de hipótese ou discussão mediada pelo professor), interromper cálculos de física desnecessários e reduzir a taxa do render loop para 20–30 FPS, preservando a bateria dos aparelhos.
4. **Verificação Real do Modo Offline (PWA / Local):**
   - Como uma PWA não fica disponível offline por mágica na primeira visita, o aplicativo exige um teste de homologação explícito: abrir com internet, aguardar a instalação completa do cache de assets locais, fechar, desativar a rede e reabrir a Missão 01 em modo avião.

---

## 9. Governança Epistemológica e Honestidade Científica

Para manter a integridade educacional do Kirimurê, a simulação adota salvaguardas explícitas contra afirmações falsamente universais:

1. **Tempo de Depuração da Água:**
   - Não apresentar genericamente que a Baía de Todos-os-Santos leva "semanas para se limpar pelas marés" como verdade absoluta de todos os pontos.
   - Declarar explicitamente que a velocidade de recuperação observada na Missão 01 é uma **simplificação didática representativa** baseada no modelo hidrodinâmico de caixa estuarina, variando na realidade com marés, ventos, profundidade e correntes locais.
2. **Indicador de Estresse da Fauna:**
   - Apresentado como uma **resposta didática simplificada** derivada de curvas de tolerância respiratória de espécies de referência da BTS (*Acanthurus chirurgus* e *Abudefduf saxatilis*), e não como uma medição biológica universal de todos os seres marinhos.
3. **Oxigênio Dissolvido de Baseline:**
   - O valor inicial de $\sim 6,5\text{ mg/L}$ é uma condição didática ilustrativa de uma enseada saudável bem oxigenada, e não uma constante geográfica de toda a BTS.

---

## 10. Roteiro Prático de Implementação

Com a estratégia validada e as salvaguardas consolidadas, o próximo ciclo segue estritamente as prioridades:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 ORDEM CRONOLÓGICA DE DESENVOLVIMENTO                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Validar e calibrar a lógica científica da Missão 01                      │
│    (isolando a decomposição direta de DBO da via de nutrientes).            │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. Implementar o fluxo da Missão 01 dentro do painel lateral existente      │
│    (aba de Desafios/Missões), mantendo o layout e a cena 3D intactos.       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. Destacar a variável da missão na bancada inferior, recolhendo as demais  │
│    temporariamente e oferecendo saída fácil para o Modo Livre.              │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. Aplicar perfis adaptativos de qualidade e medir a estabilidade em        │
│    dispositivos reais (meta: 30 FPS mínimos no perfil escolar).             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. Validar o roteiro de aula (45 min) com educadores antes de expandir.     │
└─────────────────────────────────────────────────────────────────────────────┘
```

Esta especificação garante que o Kirimurê mantenha seu horizonte visionário de longo prazo, ao mesmo tempo em que entrega uma **ferramenta escolar cirúrgica, usável, cientificamente irretocável e apaixonante para alunos e professores**.
