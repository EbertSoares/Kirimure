# ADR-001 — Renderer oceânico em Babylon.js com WebGPU

- **Status:** aceito
- **Data:** 2026-10-21
- **Escopo:** visualização 3D da Baía de Todos-os-Santos
- **Decisão:** substituir o renderer Three.js por Babylon.js, preferindo WebGPU e usando WebGL2 como fallback

## Contexto

O Kirimurê mantém a interface, o modelo científico, os controles, as mensagens e o estado da simulação em React. Somente a camada responsável pela cena oceânica será reescrita.

A implementação Three.js validou carregamento de modelos, LOD, partículas e integração com os controles, mas não atingiu a composição visual da referência `Simulador Oceânico: Vida Entre Águas`. O problema não é apenas acabamento: a arquitetura atual trata céu e ambiente submerso como um único render, usa uma superfície que atravessa a câmera e aplica fog e pós-processamento de maneira global. Esses pressupostos impedem a reprodução fiel de uma tomada over-under.

## Decisão

Usar Babylon.js como motor da cena 3D:

- tentar inicializar `WebGPUEngine` quando `navigator.gpu` estiver disponível;
- retornar automaticamente a `Engine` WebGL2 se WebGPU falhar ou não existir;
- preservar React como proprietário do estado científico e da interface;
- expor ao renderer somente uma projeção imutável do `SimulationState` por frame;
- usar glTF/GLB como formato principal de modelos;
- manter o OBJ do barco temporariamente durante a migração, com conversão posterior para GLB/PBR;
- implementar água, composição over-under, terreno e flutuação como sistemas independentes e testáveis;
- não introduzir dependência de editor ou serviço em nuvem para executar a aplicação;
- preservar a auditoria de funcionamento offline.

## O que permanece inalterado

- React, Vite e TypeScript;
- mapa do Brasil e entrada pela Bahia;
- painel científico e abas;
- controles de temperatura, pH, microplásticos, óleo e esgoto;
- unidades, modelo de carga recebida e evolução temporal;
- velocidades 1×, 3×, 5× e 10×;
- mensagens científicas, histórico e desafios;
- identidade visual e layout da interface;
- empacotamento desktop existente.

## Problemas que precisam ser refeitos

### 1. Câmera e enquadramento

- A câmera anterior foi posicionada acima da superfície e inclinada para baixo.
- A referência usa eixo óptico horizontal e enquadramento deslocado verticalmente.
- A linha média da água deve ocupar aproximadamente 26–28% da altura do viewport.
- O deslocamento deve ser realizado pela projeção/framing, não por pitch negativo.
- A câmera deve permanecer estável; correntes não devem mover o observador.

### 2. Superfície atravessando a câmera

- Um plano infinito passando pela câmera causa clipping, popping e a impressão de que o mar atravessa o observador.
- A referência simula uma fotografia over-under com a superfície visível à frente da lente.
- A nova superfície será finita no lado próximo, sempre à frente do near plane.
- Acima e abaixo da água serão renderizados separadamente e compostos por uma máscara ondulada.

### 3. Tratamento único para ar e água

- Céu, barco e ambiente submerso não podem compartilhar o mesmo fog e a mesma correção de cor.
- O domínio aéreo precisa de contraste limpo, bloom solar e haze atmosférico.
- O domínio submerso precisa de absorção RGB por profundidade, scattering, fog aquático e refração localizada.

### 4. Água sem volume e sem leitura de ondas

- A linha d'água anterior era fina, quase reta e sem espessura óptica.
- A referência contém cristas, vales, reflexão, transmissão, espuma e refração.
- A superfície precisa combinar ondas direcionais de escalas distintas, com normais coerentes e Fresnel.
- A mesma função de ondas deve alimentar shader, espuma e física do barco.

### 5. Flutuação artificial do barco

- Translação e rotação baseadas em seno independente não representam flutuação.
- O casco deve ser tratado como corpo rígido com pontos de empuxo em proa, meio, popa, bombordo e estibordo.
- Uma onda frontal deve elevar primeiro a proa e gerar pitch; a popa responde depois.
- Heave, pitch e roll precisam de massa, inércia, amortecimento e passo de física fixo.
- O casco deve ocultar e revelar partes conforme as ondas passam à frente dele.

### 6. Terreno periódico e plano na leitura geral

- Somar senos uniformes produz um piso artificialmente homogêneo.
- O terreno-alvo tem dois bancos laterais elevados e um canal arenoso central mais profundo.
- O canal se estreita em direção ao ponto de fuga.
- A areia central só deve ficar claramente visível depois de aproximadamente 58–62% da altura da imagem.
- Grandes dunas assimétricas devem existir abaixo dos sulcos finos de areia.

### 7. Distribuição do recife

- Modelos isolados e igualmente espaçados parecem objetos colocados sobre um plano.
- Rochas devem formar primeiro a massa estrutural dos bancos.
- Corais e vegetação devem formar famílias ao redor dessas rochas.
- O centro deve permanecer majoritariamente livre.
- A densidade visual deve ser maior nos cantos inferiores e nas laterais.

### 8. Nuvens procedurais frágeis

- Gradientes radiais repetidos parecem manchas ou algodão.
- O céu precisa de três escalas de profundidade, silhuetas irregulares, bordas iluminadas e bases sombreadas.
- A implementação deve aceitar um céu HDR local e/ou nuvens de ruído volumétrico/cartões de alta resolução.
- Não deve haver uma fileira de nuvens igualmente espaçadas.

### 9. Sol e iluminação desconectados

- O sol visual, o reflexo na superfície e os raios submarinos devem compartilhar direção.
- A referência posiciona o núcleo solar perto de x=62% e y=6%.
- Destaques quentes devem coexistir com preenchimento submarino frio.
- Sombras de contato e oclusão são necessárias para assentar rochas e corais no terreno.

### 10. Fog e blur globais

- Blur de tela inteira reduz detalhe sem simular água.
- Fog deve depender de distância e profundidade, mantendo o primeiro plano nítido.
- Elementos distantes perdem vermelho e contraste gradualmente.
- O céu não recebe fog submarino.

### 11. Caustics uniformes

- Caustics precisam acompanhar a geometria, a luz e a profundidade.
- Devem ser fortes e definidas no primeiro plano, suaves à distância e moduladas pelas ondas.
- Uma malha periódica aplicada igualmente ao terreno inteiro não é suficiente.

### 12. Partículas sem hierarquia

- Marine snow deve ser fino e esparso.
- Bolhas grandes devem ser anéis transparentes com highlight, não pontos sólidos.
- Colunas de bolhas precisam ser localizadas e possuir tamanhos, velocidades e deriva diferentes.
- Correntes afetam partículas e vegetação, mas não deslocam a câmera.

### 13. LOD visível

- A troca para proxies geométricos ocorreu cedo demais e ficou aparente.
- LOD deve preservar silhueta, material e cor.
- Transições devem ocorrer fora da área focal e, quando possível, usar cross-fade.

### 14. Materiais e iluminação do barco

- O OBJ não possui o MTL referenciado e atualmente recebe materiais aproximados.
- O barco deve ser convertido para GLB com pivô, materiais PBR e linha de flutuação corrigidos.
- Até a conversão, os materiais provisórios não podem ficar superexpostos.

## Medidas da referência

Referência analisada em 1672 × 941 px:

- faixa média da água: 26–28% da altura;
- variação visual de cristas e vales: aproximadamente 24–31%;
- barco: cerca de 27% da largura, com centro próximo de 29%;
- sol: aproximadamente x=62%, y=6%;
- início do recife nas laterais: 48–52% da altura;
- início claro da areia central: 58–62% da altura;
- costa: concentrada nos últimos 15–17% da largura;
- corredor arenoso: aproximadamente 40% da largura no primeiro plano, estreitando ao fundo;
- reef banks: esquerda em 0–40%, direita em 65–100%.

Esses valores serão usados como critérios de calibração, não como coordenadas rígidas em todos os aspect ratios.

## Arquitetura-alvo

```text
React / SimulationState
          │
          ▼
MarineScene adapter
          │
          ▼
BabylonOceanRuntime
  ├── EngineFactory (WebGPU → WebGL2)
  ├── ReferenceCameraRig
  ├── SkyDomain
  ├── UnderwaterDomain
  ├── OceanSurface
  ├── OverUnderCompositor
  ├── TerrainSystem
  ├── ReefAssetSystem
  ├── BoatBuoyancySystem
  ├── ParticleCurrentSystem
  ├── ScientificVisualResponse
  └── QualityController
```

## Pipeline de renderização

1. Render do domínio aéreo para textura HDR.
2. Render do domínio submerso para textura HDR + depth.
3. Render da superfície e de sua máscara de ondas.
4. Composição over-under com refração e espessura da linha d'água.
5. Pós-processamento aéreo.
6. Pós-processamento submerso baseado em profundidade.
7. Bloom e tone mapping finais.
8. UI permanece em DOM/React, fora do canvas.

## Modelo de ondas

- conjunto determinístico de ondas Gerstner;
- amplitudes, direções, comprimentos e velocidades configuráveis;
- amostragem CPU equivalente à função GPU;
- normal e velocidade disponíveis para física;
- componente de swell longo, ondas médias, chop curto e normal detail;
- parâmetros ambientais futuros podem modular intensidade sem alterar a escala científica do aplicativo.

## Modelo de flutuação

- corpo rígido do barco com centro de massa ajustável;
- 6–10 pontos de empuxo distribuídos pelo casco;
- força proporcional à submersão, aplicada na normal local da água;
- drag vertical e lateral;
- torque gerado pelo ponto de aplicação;
- amortecimento angular;
- passo fixo e interpolação visual;
- limite de rotação para evitar instabilidade numérica;
- movimento do óleo ancorado à região do barco e transportado pela corrente superficial.

## WebGPU e fallback

- WebGPU é preferido, não obrigatório.
- Falha de inicialização deve ser capturada sem quebrar a interface.
- WebGL2 deve reproduzir a mesma composição com qualidade reduzida quando necessário.
- O backend ativo será exposto em `data-renderer` para testes e diagnóstico.
- Recursos exclusivos de WebGPU terão fallback explícito, nunca falha silenciosa.

## Fases de migração

### Fase 1 — fundação

- dependências Babylon.js;
- factory WebGPU/WebGL2;
- ciclo de vida React;
- câmera de referência;
- resize, dispose e telemetria por `dataset`;
- carregamento inicial dos modelos existentes.

### Fase 2 — composição over-under

- domínios aéreo e submerso;
- superfície finita;
- duas correções de cor;
- máscara de composição;
- linha d'água em frente da câmera.

### Fase 3 — água e barco

- ondas Gerstner compartilhadas;
- reflexão/refração;
- espuma;
- pontos de empuxo e movimento rígido;
- derramamento de óleo conectado ao barco.

### Fase 4 — terreno e atmosfera

- heightmap dirigido;
- bancos laterais e canal central;
- material de areia;
- céu, sol, nuvens e costa;
- fog por profundidade, volumetria e caustics.

### Fase 5 — recife e efeitos científicos

- distribuição em clusters;
- LOD de qualidade;
- correntes;
- partículas;
- resposta a temperatura, pH, microplásticos, óleo e esgoto.

### Fase 6 — calibração e desempenho

- comparação visual com a referência;
- perfil WebGPU e WebGL2;
- qualidade adaptativa;
- testes de contexto perdido;
- testes em Safari, Chrome e build desktop;
- auditoria offline.

## Critérios de aceitação

- a superfície nunca atravessa a câmera;
- câmera sem pitch para baixo;
- linha d'água média em 26–28% no layout desktop de referência;
- separação visual inequívoca entre ar e água;
- barco responde primeiro na proa quando uma onda frontal chega;
- terreno possui bancos laterais claramente mais altos que o canal central;
- areia central não domina a metade superior submersa;
- nuvens não exibem repetição óbvia;
- sol, reflexo e raios compartilham direção;
- bolhas grandes possuem centro transparente;
- LOD não troca para formas incompatíveis dentro da área focal;
- o estado científico continua controlando a cena sem duplicar a lógica de simulação;
- build, testes unitários e auditoria offline permanecem aprovados;
- WebGL2 assume o render quando WebGPU não pode ser inicializado.

## Riscos e mitigação

- **Migração ampla:** substituir primeiro a fundação, mantendo a API React atual.
- **WebGPU variável entre navegadores:** fallback WebGL2 obrigatório.
- **Shaders customizados:** organizar por sistema e testar isoladamente.
- **Payload:** imports modulares, modelos comprimidos e carregamento progressivo.
- **OBJ sem materiais:** converter para GLB antes da etapa final de acabamento.
- **Custo do render duplo:** resolução adaptativa e passes em meia resolução onde aceitável.
- **Instabilidade física:** fixed timestep, clamps e amortecimento crítico.

## Consequências

### Positivas

- pipeline mais completo para PBR, física e pós-processamento;
- WebGPU integrado com fallback;
- melhor separação entre sistemas gráficos;
- maior capacidade de diagnóstico e evolução.

### Negativas

- reescrita integral de `MarineScene`;
- dependência e bundle maiores;
- shaders e materiais existentes não são reaproveitados diretamente;
- período temporário em que alguns efeitos da versão Three.js ainda não estarão disponíveis.

## Regra de implementação

Nenhum efeito será considerado concluído apenas por existir. Cada fase deve ser comparada visualmente com a referência e validada pelos critérios mensuráveis deste documento antes de avançar para acabamento de modelos.
