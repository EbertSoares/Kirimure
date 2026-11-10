# ADR-002 — Diorama 3D do Recife da Baía de Todos-os-Santos

- **Status:** aceito e em implementação
- **Data:** 2026-11-08
- **Substitui:** a parte visual do ADR-001 (o motor Babylon/WebGPU continua válido)
- **Escopo:** `src/scene/babylon`, `src/scene/MarineScene.tsx`, `src/styles.css`, `src/simulation` (somente leitura), assets e scripts de cena

> ## Regra de trabalho: nenhum commit durante a migração
>
> **Não é para realizar nenhum commit enquanto fazemos as mudanças.** Toda a migração
> (documentação, código novo, remoções e limpeza) deve permanecer no working tree, sem
> `git add`, `git commit`, `git tag` ou publicação. O usuário fará a revisão e autorizará
> explicitamente qualquer commit posteriormente.

---

## 1. Contexto

A cena atual do Kirimurê nasceu como um **plano ilustrado** (`ocean-backdrop.jpg`) com
sprites 2D de peixes, corais e poluição, mais alguns modelos 3D importados
(`pale-bleak` e um tubarão) sobrepostos ao plano. Essa arquitetura tem quatro problemas
estruturais:

1. **A perspectiva é falsa.** Posições, escalas e efeitos são calculados em coordenadas
   normalizadas de tela e depois convertidos para um plano em `z = 20`. Qualquer mudança
   de câmera, proporção de tela ou profundidade exige correções de "fitting" espalhadas
   pelo runtime.
2. **A ciência visual está acoplada ao bitmap.** O branqueamento dos corais lê pixels do
   backdrop; a turbidez, o óleo e o esgoto são máscaras de tela. O resultado não é
   fisicamente consistente e quebra quando a arte muda.
3. **As espécies estão erradas para a BTS.** O peixe riggado `pale-bleak` é de água doce
   europeia; barramundi e palhaço são do Indo-Pacífico; o tubarão não pertence ao conjunto
   didático. Isso contraria o ponto 7.3 da revisão científica.
4. **A cena é pesada do jeito errado.** Carrega PNGs grandes, um GLB com esqueleto de 43
   ossos por instância e um backdrop de alta resolução, mas não tem ondas, céu, nuvens,
   sol, IBL/HDR nem peixes realmente 3D.

O objetivo deste ADR é substituir toda a camada visual por um **diorama 3D fechado**,
estilizado e cientificamente responsivo, mantendo intactos o modelo de simulação, a
interface React e os atributos de diagnóstico já usados por testes e ferramentas.

## 2. Decisão

Construir um **diorama 3D de câmera fixa** com:

- **Babylon.js 9** e o mesmo fallback WebGPU → WebGL2 já existente.
- **Céu procedural + nuvens em movimento + sol** e um pipeline **HDR** com tone mapping.
- **Oceano Gerstner** compartilhado por render, espuma e flutuabilidade.
- **Terreno, recife, corais, rochas, banco de areia e barco** modelados em 3D.
- **Peixes 3D procedurais** com cardume, natação, banco (roll) e flexão de corpo,
  substituíveis depois pelos modelos BTS definitivos.
- **Enquadramento responsivo com duas câmeras fixas** (desktop e mobile) e um
  `DioramaFrame` que mapeia posições normalizadas para o frustum visível, garantindo que
  nenhum peixe ou elemento de recife saia do enquadramento mobile.
- **Respostas científicas em 3D**: branqueamento, óleo, esgoto, microplásticos,
  turbidez, hipóxia, pesca e recuperação.
- **Remoção total** do backdrop, dos sprites, do tubarão, do `pale-bleak`, do pipeline de
  arte em PNG e de todo código legado associado.

Não haverá câmera livre, órbita, zoom ou controle de usuário. A câmera é parte da
composição, como em um diorama de museu.

## 3. Não objetivos

- Não é um oceano aberto navegável.
- Não é fotorrealismo absoluto. O alvo é **realismo estilizado**: luz, água e movimento
  críveis, com silhuetas e cores legíveis em telas escolares.
- Não portar a FFT/WebGPU do `deepsea`. O Kirimurê precisa de ondas determinísticas e
  baratas que alimentem também a física do barco.
- Não alterar as equações, parâmetros, textos científicos ou fluxo pedagógico da
  simulação.
- Não integrar modelos BTS definitivos nesta etapa; a base deixa o encaixe pronto.

## 4. Arquitetura de módulos

```
src/scene/babylon/
├── engine.ts                 # já existente: WebGPU com fallback WebGL2
├── quality.ts                # perfis de qualidade (peixes, RTTs, partículas, HDR)
├── waves.ts                  # Gerstner determinístico (render + física)
├── framing.ts                # matemática pura de câmera e DioramaFrame
├── cameraRig.ts              # câmera fixa desktop/mobile + lens shift
├── visualState.ts            # tradução suavizada SimulationState -> parâmetros visuais
├── sky.ts                    # céu HDRI equiretangular, ilhas do horizonte e luzes
├── water.ts                  # superfície Gerstner + WaterMaterial + espuma
├── terrain.ts                # leito, rochas, corais, algas e restauração
├── boat.ts                   # barco flutuante com flutuabilidade multiponto
├── effects.ts                # óleo, esgoto, microplásticos, bolhas, névoa
├── fish/
│   ├── steering.ts           # steer/steerFish portados do deepsea
│   ├── school.ts             # centro, alvos, formação, roll e bend
│   ├── species.ts            # definições visuais e geometria procedural
│   └── FishSystem.ts         # agentes, ciclos de vida e instâncias 3D
├── oceanScene.ts             # fachada que monta/atualiza a cena
└── runtime.ts                # fachada pública fina (API consumida pelo React)
```

`runtime.ts` deixa de ser um arquivo de 4.700 linhas e passa a apenas:

1. criar o engine e a cena;
2. construir `OceanScene3D`;
3. repassar `updateState`, `resize`, `resetReefLife`, `dispose`, `getFps`;
4. expor `backend`, `quality`, `fishes` e `state` para diagnóstico.

## 5. Câmera e enquadramento

### 5.1 Câmera fixa com deslocamento de lente

A câmera fica em `(0, camY, camZ)` olhando para `+Z`, sem pitch e sem yaw. A linha
d'água (horizonte) é posicionada por **lens shift** (`projectionPlaneTilt`), não por
inclinação da câmera. Isso mantém o horizonte reto e permite tratar a composição como
um quadro.

Relação usada:

```
shift = 1 - 2 * waterlineScreenY
projectionPlaneTilt = atan(shift)
```

- Desktop: `waterlineScreenY = 0.27`, portanto `shift = 0.46`.
- Mobile: `waterlineScreenY = 0.25`, portanto `shift = 0.50`.

### 5.2 Perfis

| Parâmetro | Desktop | Mobile |
|---|---|---|
| FOV vertical | `0.95 rad` | `1.18 rad` |
| Altura da câmera | `1.85 m` | `1.60 m` |
| `camZ` | `-4.0` | `-3.0` |
| Linha d'água | `27%` | `25%` |
| Faixa útil de conteúdo | `32%..93%` | `32%..90%` |
| Margem horizontal segura | `4%` | `6%` |
| Profundidade útil | `8..46 m` | `8..42 m` |

O perfil é escolhido por `aspect = largura / altura` e por sinais de dispositivo
(`pointer: coarse`, largura). A troca de perfil reposiciona o recife, o barco, os
cardumes, os efeitos e o HUD de profundidade sem recarregar a cena.

### 5.3 `DioramaFrame`

`framing.ts` é matemática pura, testável sem WebGL. Para uma posição normalizada
`(u, v, depth)`:

- `u ∈ [0,1]`: fração horizontal da tela;
- `v ∈ [0,1]`: fração vertical a partir do topo;
- `depth ∈ [0,1]`: interpolação entre `zNear` e `zFar`.

```
ndcX = 2u - 1
ndcY = 1 - 2v
relZ = zNear + depth * (zFar - zNear)
x = ndcX * relZ * tanHalfFov * aspect
y = camY + (ndcY - shift) * relZ * tanHalfFov
z = camZ + relZ
```

A inversa projeta qualquer ponto de volta para `(u, v)`. Os cardumes navegam nesse
espaço normalizado; por construção, `u` e `v` dentro das margens nunca saem da tela.
No mobile, a mesma posição normalizada é comprimida horizontalmente pelo `aspect`,
enquanto o FOV maior preserva a leitura vertical. É isso que garante o requisito de
"nada sai do enquadramento mobile".

O recife e o barco também são ancorados em `(u, v, depth)`, mas com posições
tridimensionais de mundo. Um `layout(frame)` é executado no `resize()` para reposicionar
as instâncias de corais, rochas, leques e o barco sem reconstruir a cena inteira.

### 5.4 Diagnóstico de enquadramento

O runtime publica o perfil de câmera ativo (`desktop` ou `mobile`) no atributo
`data-camera-profile` do contêiner `.marine-canvas`, usado pelos testes visuais e
pela depuração. Não há mais régua CSS de profundidade: as antigas variáveis
`--depth-top` e `--depth-bottom` eram escritas num seletor inexistente
(`.scene-card`) e foram removidas junto com a dependência de DOM do `applyLayout`.

## 6. Céu, luz e HDR

### 6.1 Céu HDRI equiretangular

O céu é um **panorama HDRI real em projeção equiretangular**, não um cubemap: o
loader `.hdr` do Babylon só decodifica texturas 2D (`_HDRTextureLoader.loadCubeData`
lança `.hdr not supported in Cube.`). O arquivo final fica em
`public/textures/sky/kirimure-sky.hdr` (Radiance RGBE, 4096×256, ~3 MB) e é
carregado como `Texture` 2D com `invertY = false`, filtro trilinear,
`wrapU = WRAP_ADDRESSMODE` e `wrapV = CLAMP_ADDRESSMODE`.

Origem e bake:

- fonte: `kloofendal_48d_partly_cloudy_puresky_4k.exr` (Poly Haven, céu puro,
  4096×2048; não versionado por ter 72 MB);
- `scripts/build-sky-panorama.py` lê o EXR, descarta a metade inferior (ground
  bounce sintético), recorta a faixa de **0..22,5° acima do horizonte** em
  4096×256, limita a radiance a 8, converte para RGBE e grava o `.hdr`;
- a altura 256 é potência de 2. Na prática o loader HDR do Babylon reduz
  texturas com altura não potência de 2, então o recorte já sai no tamanho final;
- o mesmo script gera `kirimure-sky.jpg` (2048×171, sRGB) como fallback de rede.

O domo `ceu-diorama` usa mapeamento esférico direto: `u = 0.5 + az / 2π` e
`v = 1` no horizonte, subindo até `v = 0` a 22,5° de elevação. O UV anterior
comprimia ~67° de céu na faixa visível, o que esticava as nuvens e trazia o sol
para dentro do quadro. O sol do EXR está a ~48° de elevação e `u = 0.595`; fica
acima do enquadramento (topo em ~16° no desktop e ~19° no mobile), portanto não
há disco solar estourado na tela.

O céu usa `StandardMaterial` emissivo sem iluminação: `emissiveTexture` recebe o
HDRI, `emissiveColor` fica preto e `texture.level` calibra a exposição
(`0.95` para o HDR e `1.15` para o JPG). A turbidez e o esgoto reduzem o nível e
adicionam um véu cinza. O céu não entra na névoa. Não há IBL nem
`scene.environmentTexture`: o campo do HDRI tingiria a luz subaquática e custaria
uma leitura de ambiente extra; as luzes continuam ajustadas à mão.

Fallbacks em ordem: HDR → JPG → gradiente procedural imediato em
`DynamicTexture` (visível enquanto a rede responde ou se os dois arquivos
falharem).

### 6.2 Ilhas do horizonte

A silhueta da Ilha dos Frades / Itaparica é uma malha geométrica em `z = 265`,
com `StandardMaterial` fosco e sem névoa. Nuvens procedurais, camadas em parallax
e billboard de sol foram removidos: o HDRI já contém cúmulos, brilho solar e a
faixa de horizonte. As ilhas são a única geometria de terra distante.

### 6.3 HDR

- `DefaultRenderingPipeline('hdr', true, scene, [camera])`.
- Tone mapping ACES, exposição `0.96`, bloom com threshold `0.92`.
- Bloom opcional (desligado em `low`), FXAA e sharpen discreto.
- A cena é renderizada em HDR linear; o tone mapping faz a compressão para sRGB.
- O HDRI é apenas o fundo visível; não é usado como `environmentTexture`/IBL.

### 6.4 Luzes e véu subaquático

- `DirectionalLight` solar com cor quente e direção mais baixa que o sol real,
  para iluminar o recife e a areia sem achatar o céu.
- `HemisphericLight` azul-céu/areia para preencher sombras.
- `scene.fogMode = EXP2`, densidade controlada pela turbidez e pela profundidade. O céu
  ignora a névoa para não apagar o horizonte.
- `GlowLayer` discreto para brilho especular e bioluminescência de bolhas. Em
  `low`, o glow é omitido.
- A metade submersa recebe um **véu óptico em espaço de câmera**
  (`veu-submarino-azul`, `renderingGroupId = 3`): um quad com alpha por vértice
  que começa em zero na linha d'água, fica em ~0,34 na faixa do horizonte
  subaquático e sobe para 0,46–0,52 na região dos peixes e do recife. A cor vem
  dos vértices (azul oceânico no fundo, azul-turquesa perto da câmera) e é
  recalculada pelo `VisualState`; a areia continua visível por transparência,
  mas o mar domina a leitura cromática.

## 7. Oceano e física compartilhada

`waves.ts` define ondas de Gerstner determinísticas:

```
theta = k * dot(D, position) - omega * t + phase
height = A * sin(theta)
deslocamento horizontal = Q * A * D * cos(theta)
normal = normalize(-slopeX, 1, -slopeZ)
```

Dez componentes organizados em dois grupos direcionais cruzados/opostos (vagas de alísios e contra-ondas refratadas no recife) cobrem marulho longo, vagas em colisão e chop curto.
O mesmo sampler (`sampleOcean`) calcula altura, deslocamento orbital 3D, inclinação, velocidade orbital, Jacobiano de compressão (`jacobian`), espuma (`foam`) e energia de choque entre trens de ondas (`breaker`), alimentando:

- deslocamento 3D dos vértices do plano d'água (`superficie-oceano-gerstner`) e da seção transversal frontal (`frente-onda-corte`);
- normais analíticas e cascatas em espaço de mundo (`vPositionW.xz`);
- flutuabilidade hidrodinâmica multiponto de 2ª ordem do barco e impacto de proa;
- espuma, susto de peixes próximos à lâmina d'água e ajuste vertical de boias/efeitos.

O plano d'água é uma malha própria com grade **não uniforme** (mais densa perto da
câmera, mais esparsa no horizonte), acompanhada no plano frontal (`Z = 21.5`) por uma
malha de corte óptico 3D (`frente-onda-corte`, 6 camadas verticais) com `ShaderMaterial`
dedicado que simula o menisco capilar, cáusticas internas e espuma de colisão sem frestas.

### 7.1 Espuma

A espuma é gerada por um pequeno `ParticleSystem` com textura procedural:

- espuma de proa do barco, emitida no ponto de contato do casco;
- espuma de crista perto do recife, com emissão modulada pela inclinação da onda;
- intensidade reduzida em `low`.

## 8. Terreno, recife e restauração

### 8.1 Leito

Malha de terreno com:

- altimetria determinística (fBm + dunas);
- cores por vértice (areia clara, areia úmida, rocha, sombra);
- material PBR com roughness alta e normais suaves;
- textura de cáusticas procedurais animada, atenuada pela turbidez e pela claridade.

### 8.2 Recife

Componentes:

- rochas de recife: esferas icosaédricas deformadas e fundidas em poucas malhas;
- corais ramificados, cérebros, leques e tubos: geometrias procedurais agrupadas;
- algas: fitas verticais com balanço suave;
- instâncias com cores por colônia via buffer de cor (thin instances);
- ancoragem em `(u, v, depth)` para reposicionar no mobile.

### 8.3 Branqueamento

Cada colônia tem uma cor-base. A cor final é interpolada para branco-osso/cinza em função
de `visualState.bleaching`, que combina:

- perda de saúde coralina (`health.coral`);
- grau de aquecimento (`degreeHeatingWeeks`);
- estresse ácido via `effectivePh`.

O buffer de cor é atualizado em intervalos de ~0,25 s (não a cada quadro). A restauração
(`restoration.restoredCoverPercent`) revela um grupo separado de colônias jovens, com
tonalidade verde-água, sem apagar o recife existente.

## 9. Barco e flutuabilidade multiponto

O barco é um casco estilizado com cabine, mastro e boia. Cinco sondas escaladas pelo casco
(proa, popa, bombordo, estibordo e centro de carena) amostram `sampleOcean`:

- dinâmica massa-mola-amortecedor de 2ª ordem para heave (`smoothY`), pitch (`smoothPitch`) e roll (`smoothRoll`);
- deslocamento orbital horizontal (`displacementX`, `displacementZ`) para surge/sway realista;
- inclinação combinada entre diferença de altura das sondas e normal instantânea da onda;
- impacto de onda na proa (`bowSlam` a partir de `breaker` e velocidade de arfagem) modulando a espuma de proa e a esteira de popa.

O atributo `data-buoyancy="multipoint"` continua sendo publicado.

## 10. Peixes 3D e IA de cardume organizado

### 10.1 Espécies

Somente as três espécies suportadas pelo modelo de simulação:

| id | nome | papel |
|---|---|---|
| `blue-tang` | peixe-cirurgião | herbívoro de macroalgas rasas |
| `sergeant-major` | sargentinho | onívoro generalista recifal |
| `parrotfish` | peixe-papagaio | herbívoro raspador / bio-erosor |

Foram removidos `pale-bleak`, barramundi, palhaço e tubarão. Xira/roncador, cioba e
sardinha ficam documentados como **trabalho futuro**, condicionado à inclusão dessas
espécies no modelo de simulação — não podem ser adicionados apenas como decoração sem
respaldo científico.

### 10.2 Geometria provisória

Cada espécie tem:

- corpo elíptico gerado por anéis ao longo do eixo `+Z`, com UV longitudinal;
- nadadeira dorsal e peitorais fundidas;
- cauda separada, com pivô na base e rotação lateral animada;
- textura procedural de listras/manchas;
- material PBR com roughness média e leve emissão de saúde.

Quando os modelos BTS chegarem, `species.ts` passa a carregar GLBs e `FishSystem.ts`
troca o mesh-fonte por um contêiner riggado, mantendo o mesmo contrato de agentes,
cardumes, cores de saúde e diagnóstico.

### 10.3 Cardume, Boids 3D e interação com o recife

Evolução do `deepsea` com organização de fluxo e IA contextual de recife:

- centros de cardume com pré-curva suave nas bordas, desvio de rochas e repulsão mútua entre cardumes (`repelSchools`) para que dois cardumes nunca se misturem;
- alternância orgânica entre nado em corrente/cadeia (`mode = 'stream'`, onde cada peixe segue seu assento e o companheiro à frente) e carrossel/vórtice circular (`mode = 'mill'`, onde o cardume gira sincronizado em anel 3D);
- forças Boids 3D (separação elíptica proporcional ao comprimento real do peixe + alinhamento de velocidade) combinadas com relaxação posicional rígida (`resolveFishOverlaps`), impedindo que peixes se atravessem;
- desvio preditivo tangencial/superior (`steerAroundReef`) e deslizamento sem inversão de velocidade (`resolveReefCollisions`) ao redor de rochas e corais (`reefObstacles.ts`);
- IA de interação e susto: pastagem (`nibble`) na coroa iluminada de corais vivos e fuga/abrigo (`hide`) para dentro de colônias de coral ou atrás de rochas quando os peixes se assustam.

### 10.4 Ciclo de vida

Os agentes percorrem estágios de vida explícitos, usados também para diagnóstico:

`alive → sinking → bottom → repopulating → alive`

- A morte é disparada por hipóxia (`dissolvedOxygen < limiar da espécie`), saúde da
  espécie abaixo do limiar ou saúde geral dos peixes próxima de zero.
- O peixe afunda, gira de barriga para cima, repousa no leito, desvanece e só retorna
  quando a água volta a ser aceitável.
- A repopulação visual é liberada por intervenções reais de restauração de coral (`restoration.restoredCoverPercent`).
- A pressão de pesca reduz a população ativa; ao diminuir, os peixes retornam como
  `repopulating`.

A lista pública `fishes` expõe `deathStage`, `species`, `schoolId` e a posição
normalizada para os testes de fumaça.

## 11. Respostas científicas visuais

| Fator | Resposta visual 3D | Fonte no modelo |
|---|---|---|
| Saúde dos peixes | cor/emissão, atividade, mortandade e repovoamento | `health.fish`, `species`, `dissolvedOxygen` |
| Branqueamento | cor das colônias, perda de saturação, cáusticas mais fracas | `health.coral`, `degreeHeatingWeeks`, `effectivePh` |
| Óleo | manchas escuras iridescentes na superfície, brilho especular alterado, claridade reduzida | `normalizedReceivedLoad('oil', ...)` |
| Esgoto | plumas verde-acinzentadas, turbidez, espuma e cor da água | `normalizedSewagePressure(...)` |
| Microplásticos | partículas 3D à deriva, tombamento e cintilação | `normalizedMicroplasticsConcentration(...)` |
| Turbidez | névoa, cor da água, atenuação de cáusticas e luz | `env.turbidity / 100` |
| Hipóxia | peixes na superfície, natação lenta, mortandade, água mais opaca | `hypoxiaStress(dissolvedOxygen)` |
| Pesca | redução da população ativa e cardumes mais ariscos | `pressures.fishing` |
| Recuperação | retorno de cor, novos corais, peixes repovoando, água mais clara | `activeInterventions`, `restoration` |

Não há mais leitura de pixels do backdrop. Toda resposta é geométrica, material ou
paramétrica.

## 12. Qualidade e orçamento de desempenho

O perfil é escolhido por dispositivo e recalibrado pelo FPS:

| Recurso | High | Medium | Low |
|---|---|---|---|
| Peixes totais (aprox.) | 236 | 142 | 86 |
| Microplásticos | 195 | 115 | 64 |
| Bolhas | 82 | 56 | 32 |
| Malha d'água | 96×96 | 72×72 | 48×48 |
| Resolução das RTTs | 512 | 256 | 128 |
| Nuvens | 7 | 5 | 3 |
| HDR + bloom | sim | sim | HDR sem bloom |
| Glow | sim | sim | não |
| Sombras | não | não | não |

Decisões de desempenho:

- Instanced meshes para peixes e corais; thin instances para colônias.
- Nenhum modelo esquelético nesta etapa.
- Nenhuma sombra dinâmica (a luz e a profundidade já dão volume).
- RTTs do `WaterMaterial` em resolução reduzida e com lista explícita.
- Atualização de cáusticas e cores de coral a 4 Hz, não por quadro.
- Partículas e efeitos em pools fixos; nada é criado/descartado por quadro.
- `pause` após o primeiro dia congela a renderização contínua, como antes.
- Limite de pixel ratio em mobile (`engine.setHardwareScalingLevel`).

## 13. Assets, créditos e remoções

### 13.1 Remover

- `public/textures/ocean-backdrop.jpg` e toda referência CSS/runtime;
- `public/models/shark/` e toda lógica de tubarão/predador;
- `public/models/pale-bleak/` e o carregamento riggado;
- `src/assets/scene/`, `src/assets/svg/`, `src/scene/assets.ts`;
- `src/scene/fishAppearance.ts` e testes associados;
- `src/scene/backdropFitting.test.ts` e `assetsPipeline.test.ts`;
- plugin `build-scene-assets.mjs` do `vite.config.ts`;
- campos/comentários/scripts que citem `riggedFishes3D`, `sharks3D`, `backdrop` ou sprites.

### 13.2 Manter/atualizar

- `data-renderer`, `data-buoyancy="multipoint"`, `data-wave-model="shared-gerstner"`;
- `window.__kirimureRuntime` com `state`, `fishes`, `updateState`, `resize`, `resetReefLife`;
- scripts de QA que ainda fizerem sentido, atualizados para a nova API.

### 13.3 Créditos

- Movimento de cardume, steering e formação: adaptado de `deepsea` (código aberto;
  crédito no cabeçalho de `fish/steering.ts` e `fish/school.ts`).
- Babylon.js: Apache 2.0.
- Texturas procedurais, geometria e shaders desta cena: autorais do projeto.
- Modelos BTS futuros: registrar licença e autoria em `public/models/README.md`.

## 14. Fases de implementação

1. **ADR e base matemática** — framing, waves, quality, visualState.
2. **Céu, água, terreno, barco e HDR** — cena visível sem peixes.
3. **Peixes 3D** — geometria, cardumes, ciclo de vida, cores de saúde.
4. **Efeitos científicos** — óleo, esgoto, plásticos, bolhas, turbidez, hipóxia.
5. **Fachada e React** — `runtime.ts`, `MarineScene.tsx`, atributos, resize.
6. **Limpeza** — assets, scripts, testes e CSS legados.
7. **Verificação** — lint, Vitest, `tsc --noEmit` e build; inspeção visual em desktop e
   mobile; nenhum commit.

## 15. Critérios de aceitação

- Nenhum arquivo de backdrop, sprite de peixe, tubarão ou `pale-bleak` permanece no
  repositório ou no bundle.
- A cena renderiza céu, nuvens, sol, oceano com ondas, recife 3D, barco e peixes 3D.
- O horizonte fica em 26–28% no desktop e ~25% no mobile.
- Nenhum peixe, coral ou elemento de recife sai do quadro mobile em 360×640, 390×844,
  768×1024 e orientações paisagem.
- `data-renderer`, `data-buoyancy` e `data-wave-model` continuam presentes.
- Céu, água, espuma e flutuabilidade usam o mesmo sampler Gerstner.
- HDR está ativo (pipeline) com tone mapping.
- Branqueamento, óleo, esgoto, microplásticos, turbidez, hipóxia, pesca e recuperação
  produzem respostas visuais observáveis e coerentes com o modelo.
- `npm run check` passa.
- **Nenhum commit é criado.**

## 16. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| `WaterMaterial` custar caro em mobile | RTTs 128/256, lista explícita, perfil low sem bloom |
| Reflexo da água apagar peixes | Fresnel + refração; peixes próximos à superfície; luz de preenchimento |
| Câmera mobile cortar cardumes | navegação normalizada + `layout()` + testes de projeção |
| Modelos BTS futuros não encaixarem | contrato de agente independente do mesh-fonte |
| Efeitos científicos virarem "decoração" | cada efeito lê uma função do modelo, nunca um valor inventado |
| WebGPU não suportar algum recurso | todos os materiais são Babylon padrão; fallback WebGL2 |

## 17. Trabalho futuro

- Substituir a geometria procedural pelos GLBs BTS (com rigging e animação esquelética).
- Adicionar xira/roncador, cioba e sardinha quando o modelo de simulação ganhar essas
  espécies.
- Opcional: HDRI `.env` pré-filtrado para IBL, mantendo o céu procedural visível.
- Opcional: depth of field e god rays em `high`.
- Opcional: sons ambientais e de bolhas com Web Audio, sem custo de GPU.
