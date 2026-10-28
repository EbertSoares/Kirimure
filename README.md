# Kirimurê — Laboratório Digital Marinho

Aplicativo educacional offline com uma simulação interativa sobre os efeitos de alterações ambientais em um recife costeiro da Bahia.

A aplicação permite modificar temperatura da água, pH, cargas de microplásticos, óleo e esgoto. A cena marinha reage progressivamente, mostrando alterações na saúde dos corais, na população de peixes e no ecossistema como um todo.

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
- Controles físicos: temperatura e pH da água; microplásticos e óleo em kg/t; esgoto em kg/t de DBO.
- Separação entre carga lançada e faixa sazonal estimada que permanece na baía após 30 dias.
- Projeção do tempo até o estado crítico quando a exposição do cenário permanece constante.
- Aplicação simultânea de múltiplos fatores ambientais.
- Indicadores de saúde geral, dos corais e dos peixes.
- Mensagens educativas exibidas conforme a simulação evolui.
- Tempo do experimento em dias, meses ou anos.
- Controles de pausa e velocidades 1×, 3×, 5× e 10×.
- DHW em janela móvel de 12 semanas para representar intensidade e duração do calor.
- Deformação 2.5D dos peixes com movimento crescente em direção à cauda.
- Virada gradual dos peixes, sem deslocamento contrário à orientação da arte.
- Corais com palidez, branqueamento parcial, branqueamento severo e mortalidade.
- Reinicialização completa do cenário.
- Interface responsiva para computadores, tablets e celulares.
- Referências e limitações científicas documentadas neste repositório.

## Como funciona a simulação

Cada controle define uma condição-alvo. Ao aplicar as alterações, o ambiente se aproxima gradualmente desse valor, evitando mudanças instantâneas. O modelo calcula níveis de estresse separados para corais e peixes e combina os fatores ativos.

O estado visual acompanha a saúde calculada:

- o aumento do estresse térmico provoca palidez e branqueamento dos corais;
- a redução do pH prejudica principalmente a formação do esqueleto dos corais;
- os microplásticos aparecem como partículas e fragmentos em densidade proporcional à carga recebida;
- o óleo se concentra visualmente na superfície e reduz a passagem de luz;
- o esgoto acrescenta matéria orgânica e nutrientes, favorecendo algas e aumentando a demanda estimada de oxigênio;
- os peixes apresentam estresse, redução da população e mortalidade em condições severas.

O motor usa dias simulados como unidade interna. Em 1×, um dia transcorre em quatro segundos reais; 3×, 5× e 10× apenas avançam o relógio mais rapidamente, sem modificar as regras ecológicas.

O estresse térmico usa Degree Heating Weeks (DHW): somente HotSpots de pelo menos 1 °C acima da máxima média mensal entram na soma, mantida por 84 dias. Os demais efeitos dependem da intensidade e da exposição acumulada. Uma condição intensa cruza os limiares mais cedo, enquanto condições moderadas precisam permanecer por mais tempo. Ao aplicar um cenário, o app integra essa dose no tempo e informa em quanto tempo a saúde geral cruza 33%, desde que a exposição permaneça constante.

## Base científica e calibração

As entradas exibidas na interface agora correspondem a grandezas físicas, não a índices genéricos de 0 a 100:

- **Temperatura:** o cenário da Baía de Todos-os-Santos (BTS) adota 29 °C como início do HotSpot. Águas internas podem alcançar 30 °C e estudos regionais observaram branqueamento entre 29 e 30 °C. O DHW soma os HotSpots em uma janela móvel de 12 semanas; a MMM de 28 °C é uma aproximação didática que deve ser substituída pelo pixel climatológico local em uso operacional.
- **pH:** referência de 8,1 para a superfície do oceano atual. A escala é logarítmica. Óleo e microplásticos deixaram de reduzir o pH diretamente; no modelo, apenas a respiração associada ao excesso de matéria orgânica acrescenta uma queda costeira simplificada.
- **Cargas em massa:** microplásticos e óleo são inseridos em kg ou t. O esgoto é expresso em kg ou t de DBO, que representa a carga orgânica, e não o volume bruto de efluente. Os três controles cobrem de 1 kg a 100 t numa progressão 1–2–5 (1, 2, 5, 10, 20, 50 kg e assim por diante) e trocam automaticamente de kg para toneladas.
- **Carga recebida em 30 dias:** o app usa um modelo de caixa de primeira ordem. O tempo de descarga medido para a BTS foi de cerca de 38 dias no inverno e aumenta aproximadamente 60% no verão; por isso, após 30 dias, a faixa sazonal retida é `massa lançada × e^(−30/38)` a `massa lançada × e^(−30/60,8)`, aproximadamente 45%–61%.
- **Microplásticos:** dez estuários que alimentam a BTS apresentaram média de 5.180 partículas/m³, máximo de 32.784/m³ e aporte fluvial anual estimado em 3,88 trilhões de partículas. Esses dados permanecem como contexto: não são convertidos em massa porque faltam a distribuição de tamanho e a densidade dos polímeros.
- **Óleo:** o estudo ecotoxicológico usado como referência encontrou efeitos subletais após exposições de 6–24 h e, em 96 h, EC50 de 10 µg/L tPAH50 para regeneração de tecido e 27 µg/L para comportamento dos pólipos. Esses valores confirmam que duração e dose importam, mas não permitem transformar sozinhos toneladas derramadas em mortalidade local.
- **Esgoto:** observações superficiais na BTS encontraram amônia entre ≤0,291 e 3,055 µmol/L. O dado ajuda a caracterizar o ambiente, mas a entrada do cenário usa DBO para não chamar um único nutriente de “esgoto”.
- **Oxigênio dissolvido:** estimativa em mg/L. Acima de 5 mg/L geralmente sustenta a vida aquática; abaixo de 3 mg/L representa condição crítica. Não é uma medição de sensor.

### Fontes primárias e institucionais

- [Metodologia de HotSpot e DHW — NOAA Coral Reef Watch](https://www.coralreefwatch.noaa.gov/product/50km/methodology.php)
- [Escala operacional de alerta térmico — NOAA Coral Reef Watch](https://www.coralreefwatch.noaa.gov/product/5km/index_5km_dhw.php)
- [Características oceanográficas da Baía de Todos-os-Santos — Revista Brasileira de Geofísica](https://doi.org/10.1590/S0102-261X2007000400002)
- [Branqueamento nos recifes da Bahia e temperatura superficial — Biota Neotropica](https://www.biotaneotropica.org.br/BN/article/view/418)
- [pH e acidificação oceânica — NOAA](https://www.noaa.gov/education/resource-collections/ocean-coasts/ocean-acidification)
- [Parâmetros físico-químicos e nutrientes na BTS — EDUFBA/UFBA](https://pubhtml5.com/pscm/bsnx/basic/)
- [Microplásticos nos estuários ao redor da BTS — Environmental Pollution](https://doi.org/10.1016/j.envpol.2023.121224)
- [HPAs nos sedimentos da BTS — REM/UFBA](https://doi.org/10.1590/S0370-44672006000300003)
- [Toxicidade de óleo para corais — Aquatic Toxicology](https://doi.org/10.1016/j.aquatox.2020.105454)
- [Faixas de oxigênio dissolvido — US EPA](https://www.epa.gov/national-aquatic-resource-surveys/indicators-dissolved-oxygen)

### Limitações e dados ainda necessários

Esta é uma representação educativa, não um modelo oceanográfico preditivo. A projeção “crítico em” é exata apenas dentro das regras determinísticas do cenário. Ela não prevê a data real de mortalidade numa enseada ou recife específico. Os percentuais de saúde, algas e equilíbrio trófico são índices internos e não equivalem a cobertura, biomassa ou mortalidade medidas em campo. O oxigênio é estimado por uma relação simplificada.

Para uso científico preditivo ainda seriam necessários séries locais e sazonais de temperatura, salinidade, oxigênio, irradiância, alcalinidade, carbono inorgânico dissolvido, aragonita, turbidez, correntes, nutrientes e contaminantes; resposta dose–tempo específica das espécies; calibração contra observações de campo; propagação de incerteza e validação independente.

A interface distingue **carga lançada** da faixa de massa **retida/recebida no cenário após 30 dias**. Para responder em campo quanto tempo 50 t de óleo levariam para tornar uma área crítica, ainda seriam indispensáveis o ponto e a duração do vazamento, a área e o volume de mistura, maré e vento, fração de tPAH biodisponível, evaporação, emulsificação, dispersão, deposição e sensibilidade das espécies locais. Até essa calibração, o prazo exibido deve ser lido como estimativa comparativa do cenário, nunca como medição ou previsão operacional.

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
