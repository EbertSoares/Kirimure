# Kirimurê — Laboratório Digital Marinho

> **Ferramenta educacional de Cultura Oceânica** voltada para estudantes do Ensino Fundamental II (11 a 14 anos) e professores, com simulação interativa, computação gráfica 3D e governança de dados científicos aplicada aos recifes e ecossistemas costeiros da **Baía de Todos-os-Santos (BTS), Bahia**.

A aplicação permite investigar de forma investigativa e gradual as consequências de variações na temperatura da água, acidificação (pH), cargas de matéria orgânica (esgoto / DBO), vazamentos de óleo, microplásticos e pressão pesqueira. O ecossistema marinho tridimensional responde continuamente em tempo real, integrando modelos físico-químicos determinísticos, telemetria satelital e respostas ecológicas da ictiofauna e dos corais construtores.

---

## Acesso e Apoio ao Projeto

- **Repositório oficial:** [github.com/EbertSoares/Kirimure](https://github.com/EbertSoares/Kirimure)
- **Campanha Oficial Vakinha:** [Da Bahia para a França: Leve a Equipe Kirimurê à Grande Final Mundial](https://www.vakinha.com.br/vaquinha/da-bahia-para-a-franca-leve-a-equipe-kirimure-a-grande-final-mundial?utm_campaign=whatsapp&utm_content=6425557&utm_medium=website&utm_source=social-shares)
- **Plataforma:** Aplicação Web moderna de alta fidelidade visual, responsiva para Desktop e dispositivos móveis (smartphones e tablets), com injeção automática de telemetria oceanográfica e persistência local no navegador.

---

## Arquitetura Científica e Governança Epistemológica

O Kirimurê adota uma classificação epistemológica rigorosa de proveniência de dados, distinguindo as naturezas de cada informação para assegurar a integridade didática e científica:

1. **`satellite-derived` (Sensoriamento Remoto Satelital — NOAA Coral Reef Watch):**
   * SST (Temperatura da Superfície do Mar), anomalia térmica, HotSpot, Degree Heating Weeks (DHW) oficial e nível de alerta de branqueamento (`CRW_BAA`, 0 a 7) na grade global de 5 km.
   * Arquitetura resiliente multi-fonte: PacIOOS ERDDAP (`pae-paha.pacioos.hawaii.edu`), NOAA CoastWatch ERDDAP (`coastwatch.pfeg.noaa.gov`) e Coral Watch Virtual Station API (`api.coral.tsr.lol`).
   * A temperatura retornada pela API é injetada diretamente na simulação e salva em armazenamento local persistente (`localStorage`). O usuário acompanha visualmente o status da conexão via badge dedicado no menu de Dados.
   * *Restrição metodológica estrita:* Coordenadas de pixels da grade de satélite não são exibidas como marcadores geográficos locais na baía, respeitando as limitações de resolução espacial costeira.

2. **`external-model` (Modelagem Numérica Oceânica Externa — Open-Meteo Marine):**
   * Séries temporais de altura significativa de onda ($H_s$), correntes e maré derivadas dos modelos Copernicus/ECMWF para a boca da BTS, com carimbos normalizados em UTC.

3. **`kirimure-model` (Modelos Físico-Químicos Acoplados da Simulação Local):**
   * **Oxigênio Dissolvido e DBO (`oxygen.ts`):** Saturação termodinâmica de Weiss (1970), cinética de reaeração ar-mar de Streeter-Phelps, decaimento de $\text{DBO}_5 \rightarrow \text{CBOD}_u$, demanda bentônica de oxigênio (SOD; Bowie et al., 1985) e trocas metabólicas líquidas. Piso termodinâmico a $0{,}05\text{ mg/L}$.
   * **Sistema Carbonato Marinho (`carbonate.ts`):** Equilíbrio de $\text{CO}_2$ marinho pelos coeficientes de Lueker et al. (2000), Dickson (1990) e Mucci (1983). Calcula pH efetivo, $p\text{CO}_2$ e saturação de aragonita ($\Omega_{\text{arag}}$) e calcita ($\Omega_{\text{calc}}$).
   * **Dinâmica e Balanço de Massa de Óleo (`contaminants.ts`):** Particionamento em filme superficial, gotículas dispersas na coluna, HPAs biodisponíveis dissolvidos e adsorção no sedimento bentônico, com atenuação luminosa e ecotoxicologia em corais (May et al., 2020).
   * **Microplásticos Estuarinos (`part./m³`):** Concentração volumétrica superficial balizada pelas medições empíricas dos estuários da BTS (Trindade et al., 2023; 5.176 a 32.784 itens/m³).

4. **`didactic-assumption` (Cenário Interativo Experimental):**
   * Bancada pedagógica interativa para experimentação de hipóteses em sala de aula, sem sobrescrever ou mascarar dados empíricos reais.

---

## Visualização 3D Científica (Babylon.js 9)

O motor gráfico tridimensional em tempo real utiliza Babylon.js 9 (`WebGL` / `WebGPU`) com carregamento sob demanda:

* **Biofísica e Estresse Respiratório dos Peixes:** Quando o Oxigênio Dissolvido ($OD$) decai abaixo de $5{,}0\text{ mg/L}$, os cardumes exibem desaceleração natatória e letargia metabólica progressiva. Sob anóxia severa ($OD < 2{,}0\text{ mg/L}$), ocorre colapso biológico com inversão e sedimentação.
* **Branqueamento Coralino Gradual:** Degradação de zooxantelas ativada por estresse térmico prolongado (DHW acumulado) e acidificação da água ($\Omega_{\text{arag}} < 3{,}0$).
* **Atenuação Luminosa e Cáusticas Bentônicas:** Reflexos de cáusticas solares na areia do fundo atenuados dinamicamente pela presença combinada de óleo, esgoto orgânico e turbidez associada à hipóxia.
* **Plumas Difusas de Esgoto:** Dispersão subaquática restrita à coluna d'água ($v > 0{,}285$), preservando céu, sol e barco.
* **Microplásticos com Curl Noise:** Advecção hidrodinâmica suave via campo de vetores, flutuação por densidade e cintilações ópticas quando as facetas refletem raios solares.

---

## Experiência do Usuário e Responsividade

* **Seletor de Métricas Dinâmico:**
  * **Desktop:** Indicadores ilimitados com quebra automática de linha (*flex-wrap*) para garantir legibilidade integral.
  * **Mobile:** Limite de 3 métricas em smartphones padrão ($\le 680\text{px}$) e 2 métricas em telas ultra-compactas ($\le 390\text{px}$).
  * **Substituição Inteligente FIFO:** Ao marcar uma nova métrica no mobile, a primeira selecionada é desmarcada automaticamente, mantendo a tela despoluída.
* **Controles Temporais e Escala de Simulação:** Velocidades 1× (`0,5 dia/s`), 3×, 5× e 10× (`5 dias/s`), com integração numérica por sub-stepping para invariância física dos resultados.
* **Botão de Apoio à Causa:** Integrado na barra superior com estilo e curvatura unificados aos botões de controle (`var(--radius-control)`).

---

## Tecnologias

* **Linguagem & Tipagem:** TypeScript 6 (com tipagem estrita no simulador e na camada de rede).
* **Interface:** React 19.
* **Engine Gráfica 3D:** Babylon.js 9 (`@babylonjs/core`, `@babylonjs/loaders`).
* **Qualidade de Código & Linting:** ESLint 10 (Flat Config com `@eslint/js`, `typescript-eslint` e `eslint-plugin-react-hooks`).
* **Testes Automatizados:** Vitest (133 testes cobrindo todo o modelo científico, adaptadores e componentes).
* **Build & Bundler:** Vite 8 com tree-shaking para produção.

---

## Desenvolvimento e Execução Local

### Pré-requisitos
* Node.js 20 ou superior
* npm

### Instalação
```bash
git clone https://github.com/EbertSoares/Kirimure.git
cd Kirimure
npm install
```

### Comandos Disponíveis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o servidor local de desenvolvimento Vite com HMR |
| `npm run build` | Validação de tipos (`tsc --noEmit`) e compilação para produção em `dist/` |
| `npm run lint` | Executa o linter ESLint em todo o código-fonte `src` |
| `npm run lint:fix` | Corrige automaticamente problemas de formatação e lint |
| `npm run test:run` | Executa a suíte de 133 testes automatizados via Vitest |
| `npm run preview` | Pré-visualização local dos artefatos compilados de produção |

---

## Estrutura do Código-Fonte

```text
src/
├── assets/               Modelos 3D, texturas procedurais e artes visuais
├── components/           Interface, Topbar, Controles de Métricas, Mapa da Bahia e Painel de Ciência
├── hooks/                Sincronização de dados oceanográficos e estado de redimensionamento
├── scene/                Cena 3D Babylon.js, cardumes e simulação de fluidos
├── services/             Clientes NOAA CRW, Open-Meteo, tipos de proveniência e persistência
├── simulation/           Modelos acoplados de oxigênio, sistema carbonato, óleo, microplásticos e setores da BTS
├── styles.css            Design system responsivo com temas oceânicos e suporte a toque
├── App.tsx               Orquestrador principal de estado da simulação e interface
└── main.tsx              Ponto de entrada React 19
docs/
├── architecture/         Decisões arquiteturais (ADR Babylon.js WebGPU)
├── data-sources/         Mapeamento de fontes locais da BTS (UFBA, INEMA)
└── science/              Equações, limites e pressupostos analíticos do modelo
```

---

## Referências Científicas Principais

1. **Weiss, R. F. (1970).** *The solubility of nitrogen, oxygen and argon in water and seawater*. Deep Sea Research, 17(4), 721-735.
2. **Lueker, T. J., Dickson, A. G., & Keeling, C. D. (2000).** *Ocean pCO2 calculated from dissolved inorganic carbon, alkalinity, and equations for K1 and K2*. Marine Chemistry, 70(1-3), 105-119.
3. **Mucci, A. (1983).** *The solubility of calcite and aragonite in seawater at various salinities, temperatures, and one atmosphere total pressure*. American Journal of Science, 283(7), 780-799.
4. **NOAA Coral Reef Watch (CRW).** *Daily Global 5km Satellite Coral Bleaching Heat Stress Monitoring*.
5. **May, L. A., et al. (2020).** *Ecotoxicological effects of petroleum hydrocarbons on tropical reef-building corals*. Aquatic Toxicology, 226, 105454.
6. **Trindade, R. F., et al. (2023).** *Microplastics in estuaries of Todos os Santos Bay, Bahia, Brazil*. Environmental Pollution, 323, 121224.
7. **Cirano, M., & Lessa, G. C. (2007).** *Oceanographic characteristics of Baía de Todos os Santos, Brazil*. Revista Brasileira de Geofísica, 25(4), 363-387.
