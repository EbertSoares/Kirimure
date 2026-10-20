# Laboratório Digital Marinho — Recomendação Técnica

> **Documento histórico de decisão inicial.** Para o estado implementado, consulte o `README.md` e o `PLANO-TECNICO-APLICATIVO-OFFLINE.md`; valores ambientais deste arquivo não devem ser usados como parâmetros científicos.

## 1. Resumo da decisão

O projeto está suficientemente detalhado para iniciar o desenvolvimento. Como os materiais visuais em SVG já estão prontos, a stack recomendada para o MVP é:

**Vite + React + TypeScript + PixiJS 8 + Vitest + Playwright**, sem backend.

Essa combinação oferece uma interface organizada, boa performance gráfica, testes automatizados e deploy simples como site estático.

---

## 2. Stack recomendada

| Parte | Tecnologia | Motivo |
|---|---|---|
| Interface | React + TypeScript | Facilita a implementação de abas, sliders, estados, tooltips e indicadores |
| Estilos | CSS Modules ou CSS comum | A aplicação possui uma única tela e não precisa de um framework visual completo |
| Cena marinha | PixiJS 8 | Adequado para renderização 2D, sprites, partículas, transparências e animações |
| Simulação | TypeScript puro | Mantém o modelo determinístico, testável e independente da interface |
| Estado da aplicação | Store TypeScript pequena | Centraliza seleção, valores das barras, alvos, ambiente e saúde |
| Testes unitários | Vitest | Testa fórmulas de estresse, dano, recuperação, sinergia e gatilhos |
| Testes visuais e de fluxo | Playwright | Valida a aplicação nas resoluções-alvo e captura regressões visuais |
| Build e deploy | Vite + Nginx | Gera arquivos estáticos simples de hospedar e manter |

O Zustand poderá ser adicionado caso o gerenciamento de estado fique maior do que o previsto. Para o escopo atual, uma store pequena em TypeScript é suficiente.

---

## 3. Escolha do PixiJS

O PixiJS é recomendado no lugar do Phaser porque o Laboratório Digital Marinho é principalmente uma visualização interativa, e não um jogo com física, colisões, mapas ou gerenciamento complexo de fases.

O PixiJS oferece os recursos necessários:

- renderização acelerada de elementos 2D;
- sprites e transparências;
- filtros e sobreposição de camadas;
- animação de peixes;
- partículas de microplásticos;
- tintura da água e película de óleo;
- carregamento e reutilização de SVGs;
- controle direto sobre o loop de renderização.

O Phaser continua sendo uma alternativa válida, mas adicionaria sistemas que não são necessários para este MVP.

Referências:

- [Carregamento de assets no PixiJS](https://pixijs.com/8.x/guides/components/assets)
- [Uso de SVG no PixiJS](https://pixijs.com/8.x/guides/components/assets/svg)

---

## 4. Estratégia para os SVGs

Os SVGs originais serão preservados como arquivos-fonte. Uma etapa automática de otimização com SVGO deverá gerar os arquivos usados na versão de produção.

### Fundos

- Os fundos saudável, estressado e degradado devem possuir o mesmo `viewBox`, dimensões e enquadramento.
- Fundos muito detalhados serão carregados pelo PixiJS como texturas.
- A transição entre os estados será feita por sobreposição e alteração gradual de opacidade.
- A rasterização deverá considerar o tamanho real da cena e limitar o `devicePixelRatio` a 2 para evitar consumo excessivo de memória de vídeo.

### Peixes e outros elementos repetidos

- Os SVGs serão carregados uma vez e compartilhados entre as instâncias.
- Cada peixe armazenará somente posição, velocidade, direção, estado visual, limiar individual e opacidade.
- Os estados saudável, fraco e morto poderão ser arquivos separados ou variações previstas nos próprios assets.

### Partículas

- Microplásticos simples serão desenhados ou instanciados diretamente pelo PixiJS.
- Não será criado um SVG complexo independente para cada partícula.
- Garrafa, sacola e manchas de óleo poderão reutilizar os SVGs preparados pela equipe.

### Interface

- Ícones e elementos da interface permanecerão como SVG nativo no DOM.
- Textos, botões, sliders, mensagens e indicadores não serão desenhados dentro do canvas.

Antes da integração completa, deverá ser feito um teste com os SVGs reais. Filtros, padrões, textos incorporados e alguns efeitos SVG podem exigir ajustes ou rasterização.

---

## 5. Arquitetura recomendada

```text
React / DOM
    │
    │ controles, seleção e indicadores
    ▼
Store tipada
    │
    │ aplicação dos novos alvos
    ▼
Motor de simulação em TypeScript ───► Mensagens educativas
    │
    │ estado atual do ambiente e dos organismos
    ▼
Adaptador visual PixiJS
    ├── fundos em crossfade
    ├── peixes
    ├── partículas
    ├── óleo
    ├── tintura da água
    └── raios de luz
```

O motor de simulação não deverá importar React nem PixiJS. A interface e a cena apenas enviam comandos ou leem o estado produzido pelo motor.

### Estrutura sugerida

```text
src/
  app/
    App.tsx
    appStore.ts
  config/
    items.json
    messages.json
    parameters.json
    schemas.ts
  simulation/
    types.ts
    stress.ts
    simulation.ts
    messageTriggers.ts
    random.ts
  scene/
    PixiScene.ts
    AssetLoader.ts
    BackgroundSystem.ts
    FishSystem.ts
    ParticleSystem.ts
    OilSystem.ts
    WaterEffects.ts
  components/
    CategoryTabs.tsx
    ItemCard.tsx
    IntensitySlider.tsx
    HealthCard.tsx
    MessageBox.tsx
  styles/
  assets/
    svg/
tests/
  unit/
  e2e/
```

---

## 6. Ajustes no modelo antes da implementação

### 6.1 Estresse específico por organismo

O modelo deverá calcular separadamente:

```ts
stress.coral
stress.fish
```

A sinergia entre calor e poluição será aplicada somente ao estresse dos corais. A atualização da saúde deverá usar o estresse correspondente a cada organismo, evitando o uso ambíguo de um único `s_total`.

### 6.2 Taxa de recuperação

O termo `damage_max` deverá ser substituído por um parâmetro explicitamente definido, por exemplo:

```ts
maxRecoveryPerSecond
```

Isso deixa a regra de recuperação testável e evita depender de uma variável não definida.

### 6.3 Gatilhos de mensagens

As condições das mensagens não deverão ser executadas como strings de código. Os gatilhos serão representados por dados estruturados:

```json
{
  "id": "coral_heat_stress",
  "metric": "temperature",
  "operator": ">=",
  "threshold": "temperature.coralStart",
  "title": "Estresse térmico nos corais",
  "text": "A água está mais quente do que o recife suporta."
}
```

O sistema interpretará apenas métricas e operadores previamente permitidos.

### 6.4 Loop de simulação

- A renderização usará `requestAnimationFrame`.
- A simulação trabalhará com passo fixo de `0,1 s` por meio de um acumulador.
- O tempo acumulado deverá ser limitado quando a aba ficar suspensa ou o computador travar temporariamente.
- A renderização poderá ocorrer a 60 fps enquanto a simulação permanece em 10 ticks por segundo.

### 6.5 Faixa de temperatura

O limite de 80 °C deverá ser removido. A faixa inicial recomendada é de **26 °C a 35 °C**, ainda sujeita à validação científica.

### 6.6 Recuperação dos peixes

Deverá ser tomada uma decisão pedagógica explícita sobre o retorno de peixes depois que a saúde do ambiente melhorar. Caso eles reapareçam, isso deve ser apresentado como recuperação gradual da população, não como ressurreição dos mesmos indivíduos.

---

## 7. Testes

### Testes unitários com Vitest

Deverão cobrir pelo menos:

- aproximação gradual das variáveis ambientais aos alvos;
- resultado independente da taxa de renderização;
- limites de saúde entre 0 e 100;
- estresse térmico e por acidificação;
- pesos de óleo e microplásticos por organismo;
- sinergia entre calor e poluição nos corais;
- recuperação abaixo do limiar de estresse;
- reprodutibilidade da distribuição dos peixes com semente fixa;
- disparo único das mensagens;
- restauração completa no reinício.

### Testes com Playwright

Deverão validar:

- carregamento inicial saudável;
- seleção de itens nas duas abas;
- aplicação combinada de fatores;
- atualização gradual dos indicadores;
- exibição automática de mensagens;
- reinício da simulação;
- funcionamento nas resoluções 1024×768 e 1366×768;
- capturas de tela dos estados saudável, estressado e degradado.

---

## 8. Acessibilidade

- Toda a interface de controle permanecerá no DOM usando HTML semântico.
- Os sliders utilizarão `<input type="range">` com rótulos associados.
- Valores serão apresentados em texto, sem depender somente de cores.
- A caixa de mensagens poderá usar uma região `aria-live` moderada.
- O canvas terá uma descrição textual resumindo o estado atual do ecossistema.
- O foco de teclado deverá permanecer visível.
- O contraste mínimo será AA.

---

## 9. Build, compatibilidade e deploy

O Vite produzirá a pasta estática `dist/`, que será publicada na VPS usando Nginx.

O pipeline deverá executar:

```text
otimização dos SVGs
        ↓
verificação de tipos com tsc --noEmit
        ↓
testes unitários com Vitest
        ↓
build do Vite
        ↓
testes do build com Playwright
        ↓
publicação da pasta dist/
```

No Nginx:

- HTTPS obrigatório;
- Brotli ou gzip;
- cache longo para arquivos com hash;
- sem cache prolongado para `index.html`;
- fallback para `index.html`, caso seja adotado roteamento no cliente.

O funcionamento depois de uma queda de conexão já será possível se os recursos estiverem carregados na sessão. Se for necessário abrir ou recarregar o laboratório completamente offline, será adicionada uma estratégia de service worker/PWA.

Referências:

- [Vite](https://vite.dev/guide/)
- [Build para produção com Vite](https://vite.dev/guide/build)
- [Vitest](https://vitest.dev/guide/)

---

## 10. Ordem de implementação

1. Auditar e normalizar os SVGs.
2. Criar uma prova técnica com fundo, alguns peixes e partículas no PixiJS.
3. Validar desempenho em 1366×768 em um computador modesto.
4. Implementar e testar o motor de simulação isoladamente.
5. Construir a interface React.
6. Integrar interface, simulação e cena.
7. Adicionar mensagens educativas e acessibilidade.
8. Calibrar parâmetros e efeitos visuais.
9. Executar testes visuais em projetor.
10. Gerar o build e publicar na VPS.

---

## 11. Conclusão

Com os SVGs já produzidos, o maior risco inicial de criação e consistência da arte é reduzido. Os principais pontos de atenção passam a ser:

- normalização e desempenho dos SVGs;
- clareza das regras de recuperação;
- correção do cálculo de estresse por organismo;
- calibração dos efeitos visuais;
- validação científica dos parâmetros e mensagens.

A stack proposta mantém o projeto leve, modular e totalmente estático, ao mesmo tempo que oferece recursos suficientes para entregar uma experiência visual fluida e confiável em sala de aula.
