# Laboratório Digital Marinho

MVP de uma simulação interativa e educativa sobre os efeitos de alterações ambientais em um recife costeiro da Bahia.

A aplicação permite modificar fatores como temperatura da água, pH, microplásticos e óleo. A cena marinha reage progressivamente, mostrando alterações na saúde dos corais, na população de peixes e no ecossistema como um todo.

## Acesso

- Aplicação publicada: [laboratorio-digital-marinho.neatowl9.chatgpt.site](https://laboratorio-digital-marinho.neatowl9.chatgpt.site)
- Repositório: [github.com/EbertSoares/MVP---LabOceano](https://github.com/EbertSoares/MVP---LabOceano)

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
- Controles para microplásticos, óleo, temperatura e pH.
- Aplicação simultânea de múltiplos fatores ambientais.
- Indicadores de saúde geral, dos corais e dos peixes.
- Mensagens educativas exibidas conforme a simulação evolui.
- Reinicialização completa do cenário.
- Interface responsiva para computadores, tablets e celulares.
- Referências científicas acessíveis dentro da própria interface.

## Como funciona a simulação

Cada controle define uma condição-alvo. Ao aplicar as alterações, o ambiente se aproxima gradualmente desse valor, evitando mudanças instantâneas. O modelo calcula níveis de estresse separados para corais e peixes e combina os fatores ativos.

O estado visual acompanha a saúde calculada:

- o aumento do estresse térmico provoca palidez e branqueamento dos corais;
- a redução do pH prejudica principalmente a formação do esqueleto dos corais;
- os microplásticos aparecem como partículas e fragmentos dispersos;
- o óleo se concentra visualmente na superfície e reduz a passagem de luz;
- os peixes apresentam estresse, redução da população e mortalidade em condições severas.

Para que a experiência seja observável durante uma atividade, exposições que na natureza ocorreriam ao longo de dias ou semanas são comprimidas em segundos.

## Base científica

O modelo utiliza relações qualitativas e limites educativos baseados em literatura sobre recifes brasileiros e materiais de instituições científicas. Entre as principais referências estão:

- [Branqueamento de corais na Bahia — Biota Neotropica](https://www.biotaneotropica.org.br/BN/article/view/418)
- [Ondas de calor em recifes brasileiros — Frontiers in Marine Science](https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2020.00179/full)
- [Degree Heating Weeks e risco de branqueamento — NOAA Coral Reef Watch](https://coralreefwatch.noaa.gov/product/5km_v3.1_op/index_5km_dhw.php)
- [Acidificação dos oceanos — NOAA](https://www.noaa.gov/ocean-acidification)
- [Microplásticos no ambiente marinho — NOAA Marine Debris Program](https://marinedebris.noaa.gov/what-marine-debris/microplastics)
- [Impactos de derramamentos de óleo — NOAA](https://www.noaa.gov/explainers/oil-spills-major-marine-ecosystem-threat)

### Limitação importante

Esta é uma representação educativa simplificada, não um modelo oceanográfico preditivo. Os índices de poluição não correspondem diretamente a concentrações medidas, e os percentuais de saúde não devem ser interpretados como previsões de mortalidade real.

## Tecnologias

### Linguagens

- TypeScript
- HTML
- CSS
- SVG/XML
- JSON

### Bibliotecas e ferramentas

- React 19 para os componentes da interface.
- PixiJS 8 para a cena marinha animada.
- Vite 8 para desenvolvimento e geração do bundle.
- Vitest para testes automatizados do modelo.
- Playwright para testes de interface e navegação.

## Executando localmente

### Pré-requisitos

- Node.js 20 ou superior.
- npm.

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
```

Apesar do nome histórico da pasta `assets/svg`, parte das artes fornecidas está em PNG com transparência. O visual de microplásticos criado para a simulação utiliza SVG nativo.

## Próximas evoluções sugeridas

- incluir salinidade, oxigênio dissolvido e turbidez;
- representar exposição térmica acumulada em dias ou semanas;
- adicionar espécies características de diferentes regiões da Bahia;
- criar cenários guiados e desafios para uso em sala de aula;
- disponibilizar comparações antes/depois e relatórios da simulação;
- validar os parâmetros com especialistas em ecologia marinha;
- ampliar os testes automatizados de acessibilidade e responsividade.

## Licença e uso das artes

Antes de distribuir ou reutilizar o projeto publicamente, confirme a licença do código e os direitos de uso das artes presentes em `src/assets/`.
