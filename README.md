# Kinimurê — Laboratório Digital Marinho

Aplicativo educacional offline com uma simulação interativa sobre os efeitos de alterações ambientais em um recife costeiro da Bahia.

A aplicação permite modificar fatores como temperatura da água, pH, microplásticos e óleo. A cena marinha reage progressivamente, mostrando alterações na saúde dos corais, na população de peixes e no ecossistema como um todo.

## Acesso

- Aplicativo desktop: gerado localmente com Tauri; não exige internet depois de instalado.
- Aplicação publicada: [laboratorio-digital-marinho.neatowl9.chatgpt.site](https://laboratorio-digital-marinho.neatowl9.chatgpt.site)
- Repositório: [github.com/EbertSoares/Kirimure](https://github.com/EbertSoares/Kirimure)

> A versão publicada está configurada como privada e pode solicitar autenticação.

## Objetivo do MVP

O projeto busca transformar conceitos de ecologia marinha em uma experiência visual simples. O usuário pode testar diferentes cenários e observar, de forma acelerada, como pressões ambientais podem afetar um recife.

O MVP foi desenvolvido para:

- apoiar atividades educativas sobre conservação marinha;
- demonstrar relações entre fatores ambientais e saúde do ecossistema;
- apresentar conceitos como branqueamento de corais e acidificação oceânica;
- oferecer uma base extensível para futuras espécies, fenômenos e atividades pedagógicas.

## Funcionalidades

- Cena marinha animada renderizada em tempo real.
- Peixes com estados saudável, estressado e morto.
- Corais com estados saudável, pálido, parcialmente branqueado e branqueado.
- Controles para temperatura, pH, microplásticos, óleo e carga de nitrogênio do esgoto.
- Aplicação simultânea de múltiplos fatores ambientais.
- Indicadores de saúde geral, dos corais e dos peixes.
- Mensagens educativas exibidas conforme a simulação evolui.
- Relógio simulado em dias, meses ou anos.
- Controles de pausa e velocidades 1×, 2×, 3×, 5× e 10×.
- Exposição acumulada: intensidade e duração determinam quando as consequências aparecem.
- Deformação 2.5D dos peixes com movimento crescente em direção à cauda.
- Virada gradual dos peixes, sem deslocamento contrário à orientação da arte.
- Corais com palidez, branqueamento parcial, branqueamento severo e mortalidade.
- Reinicialização completa do cenário.
- Interface responsiva para computadores, tablets e celulares.
- Modo apresentação simplificado e modo análise para aprofundamento.
- Pausa automática em estado crítico e colapso, com faixas de recuperação.
- Recorte espacial declarado de 1 km² na Baía de Todos-os-Santos.

## Como funciona a simulação

Cada controle define uma condição-alvo. Ao aplicar as alterações, o ambiente se aproxima gradualmente desse valor, evitando mudanças instantâneas. O modelo calcula níveis de estresse separados para corais e peixes e combina os fatores ativos.

O estado visual acompanha a saúde calculada:

- o aumento do estresse térmico provoca palidez e branqueamento dos corais;
- a redução do pH prejudica principalmente a formação do esqueleto dos corais;
- os microplásticos aparecem como partículas e fragmentos dispersos;
- o óleo se concentra visualmente na superfície e reduz a passagem de luz;
- os peixes apresentam estresse, redução da população e mortalidade em condições severas.

O motor usa dias simulados como unidade interna. Em 1×, quatro segundos reais equivalem a um dia simulado; as velocidades maiores apenas avançam o relógio mais rapidamente, sem modificar as regras ecológicas.

Os efeitos dependem da exposição acumulada. O estresse térmico usa uma aproximação móvel de 12 semanas em graus Celsius-semana (DHW); uma condição intensa cruza os limiares mais cedo, enquanto condições moderadas precisam permanecer por mais tempo. A interface escolhe uma única unidade para o período transcorrido: dias, meses ou anos.

O estado ecológico separa **condição dos sobreviventes** de **cobertura/abundância viva**. A condição pode melhorar depois que a pressão é retirada; a cobertura e os indivíduos mortos não reaparecem. Para recomeçar com a comunidade original é necessário reiniciar o experimento.

### Cargas e área de referência

Massa sem área ou volume produz falsa precisão. A Baía de Todos-os-Santos possui cerca de 1.223 km² e não é misturada de maneira uniforme. O MVP, portanto, não distribui 50 kg por toda a baía: usa uma célula didática costeira de **1 km²**, com **5 m de camada misturada** (5 milhões de m³).

- microplásticos: massa lançada e concentração média estimada em mg/m³;
- óleo: massa derramada e carga superficial estimada em g/m²;
- esgoto: carga de nitrogênio em kg N/dia e incremento sem renovação em mg N/L/dia;
- temperatura: intensidade e duração acumuladas em °C-semana;
- resultados de recuperação: faixas, nunca uma data exata.

As conversões usam o cenário geométrico declarado. Transporte, maré, vento, sedimentação, granulometria e renovação de água ainda não são resolvidos por um modelo hidrodinâmico; por isso os valores derivados aparecem com `≈`.

## Base científica

O modelo utiliza relações qualitativas e limites educativos baseados em literatura sobre recifes brasileiros e materiais de instituições científicas. Entre as principais referências estão:

- [Características oceanográficas da Baía de Todos-os-Santos — Cirano & Lessa](https://doi.org/10.1590/S0102-261X2007000400002)
- [Recifes de coral da APA Baía de Todos-os-Santos — Cruz, Kikuchi & Leão](https://doi.org/10.5894/rgci150)
- [Degree Heating Weeks e limiares de branqueamento — NOAA Coral Reef Watch](https://www.coralreefwatch.noaa.gov/product/vs/description.php)
- [Oxigênio dissolvido e faixas de estresse — US EPA](https://www.epa.gov/national-aquatic-resource-surveys/indicators-dissolved-oxygen)
- [Recuperação de recifes após branqueamento — Coral Reefs](https://doi.org/10.1007/s00338-019-01831-7)
- [Óleo em recifes: resposta e recuperação — NOAA](https://response.restoration.noaa.gov/sites/default/files/Oil_Spill_Coral.pdf)

### Limitação importante

Esta é uma representação educativa determinística, não um modelo oceanográfico preditivo. As cargas têm unidades físicas e um recorte espacial explícito, mas seus efeitos ainda são normalizados e não substituem medições, laudos ou um modelo de dispersão calibrado para a BTS.

## Evolução opcional: fauna 3D em cena 2.5D

O frontend não precisa ser refeito para experimentar peixes 3D. Uma evolução segura é manter React, o motor científico e o cenário PixiJS, usando Three.js somente em uma camada WebGL de fauna. Modelos GLB low-poly, com esqueleto simples e animações de nado, curva, fuga e morte, seriam renderizados por uma câmera ortográfica para preservar a composição lateral 2.5D.

Essa abordagem deve entrar primeiro como prova de desempenho com uma espécie e dezenas de instâncias. Migrar todo o recife para 3D aumentaria produção artística, memória de GPU e risco em computadores escolares sem melhorar na mesma proporção a clareza da aula.

## Tecnologias

### Linguagens

- TypeScript
- Rust
- HTML
- CSS
- SVG/XML
- JSON

### Bibliotecas e ferramentas

- React 19 para os componentes da interface.
- PixiJS 8 para a cena marinha animada.
- Tauri 2 para empacotamento desktop e execução offline.
- Vite 8 para desenvolvimento e geração do bundle.
- Vitest para testes automatizados do modelo.
- Playwright para testes de interface e navegação.

## Executando localmente

### Pré-requisitos

- Node.js 20 ou superior.
- npm.
- Rust estável e pré-requisitos do Tauri para desenvolvimento desktop.

### Instalação

```bash
git clone https://github.com/EbertSoares/MVP---LabOceano.git
cd MVP---LabOceano
npm install
```

### Ambiente de desenvolvimento

```bash
npm run dev
```

O Vite exibirá no terminal o endereço local da aplicação, normalmente `http://localhost:5173`.

### Build de produção

```bash
npm run build
```

Os arquivos de produção serão gerados em `dist/`.

O build executa antes uma auditoria que bloqueia URLs remotas, chamadas de rede e CDNs no código de runtime.

### Aplicativo desktop em desenvolvimento

```bash
npm run desktop:dev
```

### Pacote desktop

```bash
npm run desktop:build
```

O empacotamento está limitado ao instalador Windows `.exe` (NSIS). Ele inclui o instalador offline do WebView2, aumentando o pacote, mas permitindo a instalação em escolas desconectadas. O instalador final é gerado em Windows ou pelo workflow manual do GitHub Actions.

### Pré-visualização do build

```bash
npm run preview
```

### Testes

```bash
npm run test:run
```

Para executar os testes em modo interativo:

```bash
npm test
```

## Estrutura principal

```text
src/
├── assets/svg/           Artes de peixes, corais, ambiente e poluição
├── components/           Ícones e componentes reutilizáveis
├── scene/
│   ├── assets.ts         Importação centralizada das artes
│   └── MarineScene.tsx   Renderização e animação com PixiJS
├── simulation/
│   ├── config.ts         Limites, pesos e definições dos controles
│   ├── messages.ts       Mensagens educativas contextuais
│   ├── model.ts          Cálculo de estresse e saúde
│   ├── model.test.ts     Testes automatizados do modelo
│   └── types.ts          Tipos da simulação
├── App.tsx               Interface e estado principal
├── main.tsx              Inicialização da aplicação
└── styles.css            Design responsivo
scripts/
└── check-offline-runtime.mjs  Auditoria de dependências de rede
src-tauri/                 Camada desktop nativa e empacotamento
```

Apesar do nome histórico da pasta `assets/svg`, parte das artes fornecidas está em PNG com transparência. O visual de microplásticos criado para a simulação utiliza SVG nativo.

## Próximas evoluções sugeridas

- incluir salinidade, oxigênio dissolvido e turbidez;
- adicionar espécies características de diferentes regiões da Bahia;
- criar cenários guiados e desafios para uso em sala de aula;
- disponibilizar comparações antes/depois e relatórios da simulação;
- validar os parâmetros com especialistas em ecologia marinha;
- ampliar os testes automatizados de acessibilidade e responsividade.

## Licença e uso das artes

Antes de distribuir ou reutilizar o projeto publicamente, confirme a licença do código e os direitos de uso das artes presentes em `src/assets/`.
