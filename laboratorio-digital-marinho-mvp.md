# Laboratório Digital Marinho — Documento Técnico do MVP

Hackathon Cultura Oceânica (Salvador/BA) · Frente 3: estudantes, professores e comunidades

Status: rascunho para validação da equipe. Itens marcados com **[A CONFIRMAR]** dependem de decisão do time (seção 13).

---

## 1. Visão geral

### 1.1 O que é

Um laboratório virtual gamificado, em formato web, que representa em 2D um recife costeiro da Bahia. O professor escolhe o que será aplicado ao ambiente (poluentes e fenômenos climáticos), define a intensidade de cada um e vê, de forma visual e gradual, as consequências sobre os seres vivos.

Referências de experiência: Plague Inc. (ver um processo se espalhar e seus efeitos acontecerem ao longo do tempo) e Universe Sandbox (manipular variáveis de um sistema e observar o resultado).

### 1.2 Problema e público

- **Problema:** a Cultura Oceânica é pouco trabalhada nas escolas baianas, e conceitos como acidificação, branqueamento de corais e microplásticos são abstratos em sala de aula.
- **Público primário:** professores, que usam o laboratório projetado em sala como ferramenta de aula.
- **Público secundário:** estudantes, que exploram e testam hipóteses.
- **Contexto de uso:** sala de aula, projetor ou TV, computadores e internet de qualidade variável.

### 1.3 Princípios do MVP

1. **Causa e efeito visível:** cada ação deve ter consequência perceptível na cena.
2. **Gradualidade:** nada acontece instantaneamente. Os efeitos se desenvolvem ao longo de segundos, como um processo.
3. **Explicar o "porquê":** a cena mostra o que aconteceu e o texto explica por que aconteceu.
4. **Escopo enxuto:** apenas o necessário para validar a ideia. Nenhuma função extra por enquanto.
5. **Leve e acessível:** roda em computadores modestos, sem login e sem backend.

---

## 2. Escopo do MVP

### 2.1 Dentro do escopo

| Área | Item |
|---|---|
| Cena | Um único cenário: recife costeiro da Costa da Bahia, vista lateral subaquática com faixa de superfície visível |
| Elementos | Microplásticos, Óleo |
| Fenômenos | Temperatura da água, pH |
| Controle | Seleção de itens, barra de intensidade para cada item, combinação livre entre itens, botão "Aplicar alterações", botão "Reiniciar simulação" |
| Simulação | Evolução gradual das variáveis ambientais e da saúde dos organismos |
| Indicadores | Saúde do ecossistema: Geral, Corais, Peixes |
| Seres vivos | Peixes (sprites individuais) e corais (parte do fundo) |
| Educação | Mensagens explicativas automáticas e ajuda "?" por item |
| Entrega | Site estático hospedado em VPS |

### 2.2 Fora do escopo (decidido)

- **Controle de velocidade do tempo (1x, 3x, 5x e 10x):** será implementado depois da validação do MVP. A simulação já deve ser escrita para aceitar um passo de tempo parametrizável (seção 5.6), mas sem nenhuma interface para isso agora.
- Login, contas, salvamento de cenários, banco de dados.
- Múltiplos cenários (praia, mar profundo, Baía de Todos os Santos).
- Modo professor com relatórios, exportação, quiz.
- Versão mobile otimizada.
- Multiplayer ou compartilhamento online de simulações.

### 2.3 Em dúvida **[A CONFIRMAR]**

- **Salinidade** e **Peixes predadores** aparecem no mockup, mas não estão neste documento. Detalhes na seção 13.

---

## 3. Fluxo de uso

1. O professor abre o site. A cena aparece saudável, sem nada selecionado, com os indicadores em 100%.
2. No painel lateral direito, escolhe a aba **Elementos** ou **Fenômenos**.
3. Marca um ou mais itens. Cada item marcado exibe sua barra de intensidade.
4. Ajusta as barras. Pode combinar itens de ambas as abas.
5. Clica em **Aplicar alterações**.
6. A cena começa a se transformar gradualmente. Os indicadores caem aos poucos e mensagens explicativas aparecem conforme limiares são cruzados.
7. O professor pode alterar as barras e aplicar de novo a qualquer momento, ou clicar em **Reiniciar simulação** para voltar ao estado inicial.

---

## 4. Interface

### 4.1 Layout (desktop, alvo 1280×720 ou maior)

```
┌──────────────────────────────────────────────────────────────────┐
│ Logo  Laboratório Digital Marinho      (i) texto     [Reiniciar] │
├──────────────────────────────────────┬───────────────────────────┤
│                                      │ [ Elementos ][ Fenômenos ]│
│                                      │  cards dos itens da aba   │
│            CENA 2D                   │  ─────────────────────    │
│       (canvas, ~65% largura)         │  barras dos itens         │
│                                      │  marcados                 │
│                                      │  [  Aplicar alterações  ] │
│  ┌ caixa de mensagem explicativa ┐   │  Saúde do ecossistema     │
│  └───────────────────────────────┘   │  Geral / Corais / Peixes  │
└──────────────────────────────────────┴───────────────────────────┘
```

Largura mínima suportada: 1024 px. Abaixo disso, não há garantia de layout (mobile fora do MVP).

### 4.2 Painel lateral: abas e seleção

- **Duas abas**: Elementos e Fenômenos. A aba ativa fica destacada.
- Cada aba mostra **cards** dos seus itens:
  - Elementos: Microplásticos, Óleo.
  - Fenômenos: Temperatura da água, pH.
- **Marcação de seleção:** clicar num card o marca com um check e o destaca. Clicar de novo desmarca. Não usar cadeado (o cadeado indica "bloqueado").
- Ao marcar um item, **sua barra de intensidade aparece** abaixo dos cards.
- Itens marcados permanecem ativos ao trocar de aba. A barra de cada item marcado continua visível, de forma que o professor combine Elementos e Fenômenos livremente.
- Cada barra tem título, ícone, valor atual com unidade, extremos rotulados e um botão "?" com explicação curta.

### 4.3 Barras de intensidade

| Item | Tipo | Faixa | Valor inicial ao marcar | Exibição |
|---|---|---|---|---|
| Microplásticos | índice (adimensional) | 0 a 100 | 0 | "Baixo" … "Alto" |
| Óleo | índice (adimensional) | 0 a 100 | 0 | "Baixo" … "Alto" |
| Temperatura da água | °C | 26 a `TEMP_MAX` **[A CONFIRMAR]** | 26 | valor em °C |
| pH | unidade de pH | 7,4 a 8,2 **[A CONFIRMAR]** | 8,1 | valor numérico |

Observações:

- O valor inicial de cada barra é o estado saudável de referência (baseline).
- Índices de poluentes são **abstratos**, não representam concentração real. Isso deve estar escrito no "?" para não induzir a erro.
- Usar `<input type="range">` nativo, que já oferece acesso por teclado e leitor de tela.

### 4.4 Botões

- **Aplicar alterações:** fixo abaixo das barras, largura total do painel. Desabilitado se nenhum item estiver marcado. Ao clicar, define os novos alvos da simulação (seção 5.3).
- **Reiniciar simulação:** no cabeçalho. Desmarca todos os itens, restaura o baseline e zera mensagens já exibidas.

### 4.5 Card "Saúde do ecossistema"

Três barras com porcentagem: **Geral**, **Corais**, **Peixes**.

Código de cor único para as três (não usar azul fixo em uma e semáforo nas outras):

| Faixa | Cor |
|---|---|
| 67–100% | verde |
| 34–66% | amarelo |
| 0–33% | vermelho |

Sempre mostrar o número ao lado da barra (não depender só da cor).

### 4.6 Caixa de mensagem explicativa

Faixa abaixo da cena que exibe a mensagem educativa mais recente (título curto + 1 ou 2 frases). Atualizada automaticamente quando um limiar é cruzado (seção 5.7). Não depende de o usuário clicar em nada.

### 4.7 Requisitos de apresentação em sala

- Fonte mínima de 16 px no painel (rótulos de extremos das barras inclusos).
- Contraste mínimo AA entre texto e fundo.
- Informação nunca só por cor.
- Testar em projetor e em tela de 1366×768.

---

## 5. Modelo de simulação

A simulação é um modelo simples e determinístico, em tempo discreto, separado da camada visual. É ele que garante que combinações de itens produzam resultados coerentes.

### 5.1 Variáveis

**Alvos (definidos pelo usuário ao aplicar):**

```
target = { microplastics, oil, temperature, ph }
```

**Ambiente (valores atuais, evoluem aos poucos até o alvo):**

```
env = { microplastics, oil, temperature, ph }
```

**Organismos:**

```
health = { coral: 0..100, fish: 0..100 }
overall = wCoral * coral + wFish * fish        // pesos iniciais: 0.5 e 0.5
```

### 5.2 Estado inicial (baseline)

```
env = { microplastics: 0, oil: 0, temperature: 26, ph: 8.1 }
health = { coral: 100, fish: 100 }
```

### 5.3 Aplicar alterações

Ao clicar em Aplicar:

- Para cada item **marcado**, `target[item]` recebe o valor da barra.
- Para cada item **desmarcado**, `target[item]` volta ao baseline (a poluição "sai" e o ambiente se recupera gradualmente).

### 5.4 Evolução do ambiente (suavização)

A cada tick, cada variável ambiental se aproxima do alvo com aproximação exponencial (primeira ordem):

```
env_i += (target_i - env_i) * (1 - exp(-dt / tau_i))
```

`tau_i` é a constante de tempo de cada variável (valor inicial: 6 s). Isso garante que a água não muda instantaneamente.

### 5.5 Estresse e saúde

**Estresse por fator** (`s` de 0 a 1), por organismo, a partir de `env`:

- Temperatura e pH: função linear por partes entre um limiar "início do estresse" e um limiar "estresse máximo".
- Microplásticos e óleo: `s = peso * (env / 100)`, com pesos por organismo.

```
stressFromThreshold(x, start, max) = clamp((x - start) / (max - start), 0, 1)   // para temperatura
                                    // pH usa a mesma ideia, invertida (queda de pH = estresse)
```

**Combinação de fatores:**

```
s_total = 1 - Π(1 - s_i)          // fatores se somam sem ultrapassar 1
```

**Sinergia para corais:** coral sob calor é mais vulnerável a poluentes.

```
s_pol   = max(s_oil, s_microplastics)
s_coral = min(1, s_total * (1 + synergy * min(s_temp, s_pol)))      // synergy inicial: 0.5
```

**Atualização da saúde por tick:**

```
damage   = (100 / collapseSeconds[organismo]) * s_total
recovery = (damage_max / recoveryFactor) * (1 - s_total)   // apenas se s_total < recoveryThreshold
health   = clamp(health - damage*dt + recovery*dt, 0, 100)
```

Parâmetros iniciais: `collapseSeconds` coral 45 s, peixes 35 s (tempo de colapso total sob estresse máximo); `recoveryFactor` 4 (recuperar é mais lento que degradar); `recoveryThreshold` 0,1.

### 5.6 Tempo

- A simulação roda em **passo fixo**: 10 ticks por segundo, `dt = 0,1 s`.
- `dt` vem de uma constante de configuração. Todo cálculo usa `dt` e nunca assume 1 segundo.
- Isso deixa pronto o caminho para multiplicar o tempo no futuro, **sem implementar nenhuma interface para isso agora**.
- A renderização roda a 60 fps independente da simulação e lê o estado mais recente.

### 5.7 Mensagens educativas (gatilhos)

Mensagens são dados (JSON), não código. Cada uma tem condição, texto e dispara **uma vez por simulação**:

```json
{
  "id": "coral_heat_stress",
  "when": "env.temperature >= config.temp.coral.start",
  "title": "Estresse térmico nos corais",
  "text": "A água está mais quente do que o recife suporta. Os corais expulsam as algas que vivem neles e que dão cor e parte da sua energia."
}
```

Conjunto inicial (a revisar com um especialista antes do pitch):

| id | Gatilho | Ideia da mensagem |
|---|---|---|
| coral_heat_stress | temperatura acima do limiar de estresse do coral | corais expulsam as algas simbiontes |
| coral_bleaching | saúde do coral abaixo de 50 | sem as algas o coral perde a cor e passa fome; se o calor persistir, morre |
| acidification | pH abaixo do limiar de estresse | mais CO₂ dissolvido deixa a água ácida e dificulta a formação do esqueleto de carbonato de cálcio |
| microplastics_chain | microplásticos acima de 40 | animais ingerem microplásticos, que entram na cadeia alimentar |
| oil_film | óleo acima de 30 | película na superfície reduz luz e troca de gases e cobre os animais |
| fish_decline | saúde dos peixes abaixo de 50 | parte da população já não resiste às condições |

---

## 6. Parâmetros científicos

> **Importante:** os limiares de temperatura e pH abaixo são **hipóteses de trabalho** e devem ser verificados em fontes (NOAA Coral Reef Watch, relatórios do IPCC sobre oceanos, literatura de Abrolhos e do litoral baiano) antes do pitch. Os **pesos de poluentes** são de **balanceamento de jogo**, calibrados jogando, não valores científicos. Todos ficam em arquivo de configuração para ajuste sem mexer no código.

| Parâmetro | Valor inicial | Observação |
|---|---|---|
| Temperatura baseline | 26 °C | mínimo da barra |
| Estresse do coral começa | 29 °C | branqueamento costuma ocorrer quando a água fica cerca de 1 °C acima da máxima média mensal por semanas |
| Estresse máximo do coral | 33 °C | |
| Estresse dos peixes começa | 31 °C | |
| Estresse máximo dos peixes | 36 °C | |
| pH baseline | 8,1 | |
| pH: estresse do coral começa | 7,95 | |
| pH: estresse máximo do coral | 7,6 | |
| pH: estresse dos peixes começa | 7,8 | efeito menor que em organismos calcificadores |
| pH: estresse máximo dos peixes | 7,4 | |
| Peso do óleo | coral 0,9 · peixes 1,0 | balanceamento |
| Peso dos microplásticos | coral 0,3 · peixes 0,7 | balanceamento |
| Sinergia calor + poluição (coral) | 0,5 | balanceamento |
| Peso na saúde geral | coral 0,5 · peixes 0,5 | |

---

## 7. Camada visual

### 7.1 Direção de arte

Estilo do mockup: ilustração subaquática semi-realista, colorida e iluminada. Para ser dinâmica, a cena **não pode ser uma imagem única**: é composta por camadas.

Alternativa em vetor (SVG, estilo flat) é viável se alguém do time desenhar vetor com rapidez, mas não é a rota principal por custo de produção. **[A CONFIRMAR]**

### 7.2 Camadas (de trás para frente)

| # | Camada | Descrição | Controlada por |
|---|---|---|---|
| 1 | Fundo | 3 versões da mesma cena (saudável, estressada, degradada) | saúde do coral |
| 2 | Raios de luz | efeito de luz vindo da superfície | fixo; atenuado por óleo |
| 3 | Peixes (fundo) | cardume pequeno e distante | saúde dos peixes |
| 4 | Peixes (frente) | espécies maiores, mais detalhadas | saúde dos peixes |
| 5 | Partículas | microplásticos e detritos maiores (garrafa, sacola) | `env.microplastics` |
| 6 | Tintura da água | overlay de cor que escurece e turva | `env.oil`, `env.microplastics` |
| 7 | Superfície | faixa de superfície no topo (10 a 15% da altura) | `env.oil` (película) |

A superfície visível é necessária para que o óleo tenha onde aparecer.

### 7.3 Fundo em 3 estados (corais)

Três imagens com a **mesma composição**: A (saudável, 100%), B (estressada, ~50%) e C (degradada, ~0%). A transição é por sobreposição com opacidade:

```
alpha_B = coral >= 50 ? (100 - coral) / 50 : 1
alpha_C = coral <  50 ? (50  - coral) / 50 : 0
// desenhar A opaca, depois B com alpha_B, depois C com alpha_C
```

Risco principal: manter exatamente o mesmo enquadramento entre as três versões. Esse teste é a **primeira tarefa** do projeto (fase 0, seção 11).

### 7.4 Peixes

- Poucas espécies (3 a 4), com **3 estados cada**: saudável, fraco (cor apagada, nadando devagar) e morto.
- Cada peixe tem um **limiar individual** sorteado (com semente fixa) entre 5 e 95. O peixe fica fraco quando `health_fish < limiar + 15` e morre quando `health_fish < limiar`. Assim eles morrem aos poucos, em ordem diferente, e não todos de uma vez.
- Animação de morte: gira de lado, flutua para cima por alguns segundos, perde opacidade e é removido.
- Se a saúde subir de novo, peixes voltam gradualmente com fade-in.
- Limite: no máximo ~25 peixes ativos na cena.

### 7.5 Partículas

| Efeito | Regra |
|---|---|
| Microplásticos | quantidade = `round(MAX_PARTICLES * env.microplastics / 100)`, tamanhos variados, deriva lenta com leve balanço e afundamento lento |
| Detritos grandes | 0 a 3 itens (garrafa, sacola) que aparecem em degraus conforme o índice |
| Óleo | película escura na superfície com opacidade proporcional a `env.oil`, mais manchas que descem devagar |
| Tintura da água | `alpha = 0,5 * oil/100 + 0,15 * micro/100`, mais forte no topo |

`MAX_PARTICLES` inicial: 150.

### 7.6 Lista de assets

| Asset | Formato | Observação |
|---|---|---|
| bg_saudavel, bg_estressado, bg_degradado | WebP, 1600×1200 | mesma composição, com superfície visível |
| Sprites de peixe (3 a 4 espécies × 3 estados) | WebP com transparência, ~256 px | mesmo estilo do fundo |
| Partículas: fragmentos (5 formas), garrafa, sacola | WebP com transparência | |
| Película de óleo e mancha | WebP com transparência | |
| Raios de luz | WebP ou gradiente gerado por código | |
| Ícones da interface | SVG | |

Orçamento: total de assets abaixo de ~8 MB.

---

## 8. Arquitetura técnica

### 8.1 Stack proposta

| Camada | Tecnologia | Motivo |
|---|---|---|
| Build | Vite + TypeScript | rápido, tipagem reduz bugs |
| Cena | Phaser 3 (ou PixiJS) | sprites, tweens, partículas e escala de tela prontos |
| Interface | HTML/CSS + TypeScript | painel como DOM comum; React é opcional |
| Simulação | TypeScript puro, sem dependência de Phaser | testável isoladamente |
| Testes | Vitest | testes do modelo de simulação |
| Hospedagem | arquivos estáticos em VPS com Nginx | não há backend |

Phaser entrega mais coisas prontas; PixiJS é mais leve. Para uma equipe sem experiência prévia em jogos web, Phaser costuma ser mais rápido de começar. **[A CONFIRMAR]**

### 8.2 Estrutura de pastas

```
src/
  main.ts
  config/
    parameters.json        // limiares, pesos, constantes de tempo
    messages.json          // mensagens educativas
    items.json             // itens, faixas, textos de ajuda
  sim/
    types.ts
    model.ts               // funções puras de estresse e saúde
    simulation.ts          // estado + tick(dt)
    messages.ts            // avaliação de gatilhos
  scene/
    SceneManager.ts
    BackgroundBlender.ts
    FishSystem.ts
    ParticleSystem.ts
    WaterTint.ts
  ui/
    CategoryTabs.ts
    ItemCard.ts
    IntensitySlider.ts
    ApplyButton.ts
    HealthCard.ts
    MessageBox.ts
  store/
    appStore.ts            // seleção, valores das barras, estado da simulação
  assets/
tests/
  model.test.ts
```

### 8.3 Fluxo de dados

```
UI (seleção, barras) ──► store ──[Aplicar]──► simulation.setTargets()
                                                     │
                       loop fixo 10 Hz:  simulation.tick(dt)
                                                     │
                                                state (env, health)
                                                     │
                 ┌───────────────────────────────────┼─────────────────────┐
                 ▼                                   ▼                     ▼
          scene (60 fps)                      HealthCard UI           MessageBox
   (lê o estado e desenha camadas)         (barras de saúde)      (gatilhos de mensagem)
```

A simulação nunca conhece a cena. A cena e a UI apenas leem o estado.

### 8.4 Tipos principais (referência)

```ts
type ItemId = 'microplastics' | 'oil' | 'temperature' | 'ph';

interface Targets { microplastics: number; oil: number; temperature: number; ph: number }
interface Env     { microplastics: number; oil: number; temperature: number; ph: number }
interface Health  { coral: number; fish: number }

interface SimState {
  env: Env;
  targets: Targets;
  health: Health;
  overall: number;
  firedMessages: Set<string>;
}
```

### 8.5 Configuração

Todos os números da seção 5 e 6 ficam em `parameters.json`, por exemplo:

```json
{
  "tickRate": 10,
  "tau": { "microplastics": 6, "oil": 6, "temperature": 6, "ph": 6 },
  "temperature": { "min": 26, "max": 80, "coralStart": 29, "coralMax": 33, "fishStart": 31, "fishMax": 36 },
  "ph": { "min": 7.4, "max": 8.2, "baseline": 8.1 },
  "collapseSeconds": { "coral": 45, "fish": 35 },
  "weights": { "overall": { "coral": 0.5, "fish": 0.5 } }
}
```

### 8.6 Hospedagem e deploy

- Build gera uma pasta estática (`dist/`).
- Nginx na VPS serve a pasta com HTTPS e compressão gzip ou brotli.
- Cache longo para assets com hash no nome; sem cache para `index.html`.
- Sem backend, sem banco, sem cookies, sem coleta de dados. Isso reduz risco operacional e problemas de privacidade com estudantes.

---

## 9. Desempenho e compatibilidade

| Requisito | Meta |
|---|---|
| Taxa de quadros | 60 fps em notebook modesto; mínimo aceitável 30 fps |
| Peso total inicial | abaixo de ~8 MB |
| Navegadores | versões atuais de Chrome, Edge, Firefox; Safari como desejável |
| Resolução | 1366×768 como mínimo confortável; cena escala mantendo proporção |
| Internet lenta | carregar todos os assets na abertura, com barra de progresso, e depois funcionar sem rede |
| Limites | ≤ 150 partículas, ≤ 25 peixes ativos |

---

## 10. Critérios de aceite do MVP

1. Abrir o site mostra a cena saudável, com indicadores em 100%.
2. As duas abas mostram seus itens, e marcar um item exibe sua barra.
3. Itens de abas diferentes podem ficar marcados ao mesmo tempo.
4. "Aplicar alterações" fica desabilitado sem itens marcados.
5. Após aplicar, a mudança é **gradual**: o efeito completo leva dezenas de segundos, não é instantâneo.
6. Aumentar temperatura acima do limiar faz o coral clarear gradualmente e a saúde dos corais cair.
7. Aumentar microplásticos aumenta a quantidade de partículas e reduz a saúde dos peixes; peixes morrem em momentos diferentes.
8. Aplicar óleo mostra película na superfície e escurecimento da água.
9. Combinar calor e poluente produz efeito pior no coral do que cada um isoladamente.
10. Mensagens explicativas aparecem sozinhas nos gatilhos definidos, uma vez cada.
11. "Reiniciar simulação" restaura tudo ao estado inicial.
12. Roda a pelo menos 30 fps em computador modesto e é legível em projetor.

---

## 11. Plano de implementação (fases)

| Fase | Entrega | Observação |
|---|---|---|
| 0 | **Teste de arte:** gerar os 3 fundos com a mesma composição e alguns sprites no mesmo estilo | decide se a abordagem visual é viável antes de investir no resto |
| 1 | Interface estática: abas, cards, barras, botões, card de saúde | sem simulação |
| 2 | Motor de simulação + testes unitários | funciona sem tela |
| 3 | Cena: fundo em camadas, peixes, partículas, tintura, película de óleo | liga a cena ao estado |
| 4 | Mensagens educativas e textos de ajuda | revisar conteúdo com especialista |
| 5 | Calibração, deploy na VPS, teste em máquina fraca e em projetor | |

Dica de ordem: o motor (fase 2) pode andar em paralelo com a arte (fase 0 e 3) por pessoas diferentes.

---

## 12. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Inconsistência entre os 3 fundos | cena "pula" ao transicionar | fazer a fase 0 primeiro; se falhar, usar um fundo único com filtro de cor/saturação |
| Estilo inconsistente entre fundo e sprites | visual amador | gerar tudo com o mesmo método e prompt de estilo |
| Parâmetros científicos questionáveis | perda de credibilidade com a banca | documentar fontes, revisar com especialista, manter números em config |
| Óleo pouco visível | efeito perdido | superfície visível no topo da cena |
| Escopo crescer | MVP não fica pronto | manter lista "fora do escopo" e só adicionar após o MVP rodar |
| Desempenho em PC fraco | animação travada | limites de partículas e peixes; WebP; testar cedo |

---

## 13. Questões em aberto

1. **Faixa de temperatura.** O time indicou 26 °C até 80 °C como máximo. **Ponto de atenção:** a água do mar real não chega a valores próximos de 80 °C, e acima de ~35 °C praticamente todo o recife já estaria morto. Com 80 °C no máximo, mais de 80% da barra seria "morte total" e a faixa útil de aprendizado (26 a ~33 °C) ficaria comprimida num trecho minúsculo. Isso também pode ser questionado pela banca. Recomendação: máximo entre **34 °C e 40 °C**. O valor é a constante `temperature.max` em `parameters.json`, então a decisão não bloqueia o desenvolvimento.
2. **Salinidade e Peixes predadores** (presentes no mockup). Recomendação: ficar fora do MVP. Salinidade tem pouco efeito visível; "peixes predadores" não está definido: se a ideia for espécie invasora (como o peixe-leão), o nome e a lógica devem dizer isso. Se a equipe quiser incluir, cada item exige regra científica, efeito visual e mensagem explicativa.
3. **Comportamento das abas.** Este documento assume: abas mostram cards, clicar no card o marca e exibe a barra. Confirmar se a barra deve aparecer direto ao clicar na aba.
4. **Faixa do pH.** Assumido 7,4 a 8,2 com baseline 8,1 (foco em acidificação). Confirmar se o pH também deve poder subir acima do baseline.
5. **Fonte da arte** e responsável por produzi-la (define quantas espécies cabem).
6. **Framework da cena:** Phaser 3 ou PixiJS.
7. **Revisão científica:** quem validará limiares e mensagens antes do pitch.

---

## 14. Glossário rápido

- **Branqueamento de corais:** perda das algas simbiontes (zooxantelas) que vivem no coral, por estresse, geralmente térmico. O coral perde a cor e parte da energia.
- **Acidificação dos oceanos:** queda do pH da água causada pelo CO₂ dissolvido, que dificulta a formação de esqueletos e conchas de carbonato de cálcio.
- **Microplásticos:** fragmentos de plástico com menos de 5 mm, ingeridos por animais marinhos.
- **Baseline:** estado de referência saudável usado como ponto de partida e de recuperação.
- **Tick:** passo discreto da simulação.
- **Sprite:** imagem 2D individual desenhada e animada na cena.
