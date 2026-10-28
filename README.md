# Kirimurê — Laboratório Digital Marinho

Aplicativo educacional e simulador interativo dos efeitos de alterações ambientais e pressões antrópicas em recifes costeiros da Baía de Todos-os-Santos (BTS), Bahia.

A aplicação permite modificar temperatura da água, pH, cargas de matéria orgânica (esgoto / DBO), óleo e microplásticos, além de pressão pesqueira. A cena marinha em 3D reage progressivamente, apresentando respostas fisiológicas e ecológicas nos corais construtores, nas populações de peixes recifais e no balanço biogeoquímico.

## Acesso

- **Repositório oficial:** [github.com/EbertSoares/Kirimure](https://github.com/EbertSoares/Kirimure)
- **Aplicação publicada:** [laboratorio-digital-marinho.neatowl9.chatgpt.site](https://laboratorio-digital-marinho.neatowl9.chatgpt.site)
- **Aplicativo desktop:** gerado localmente com Tauri 2; funciona offline após instalado.

## Arquitetura Científica e Governança Epistemológica

O Kirimurê distingue explicitamente quatro categorias de informação ambiental para manter total transparência epistemológica:

1. **Produtos de Satélite (NOAA Coral Reef Watch):** SST, anomalia térmica, HotSpot térmico e Degree Heating Weeks (DHW) obtidos via ERDDAP da NOAA (grade 5 km), com snapshot histórico calibrado (El Niño mar/abr 2024) para contingência offline.
2. **Produtos de Modelo Numérico Global (Open-Meteo Marine):** Séries horárias de altura de onda ($H_s$), correntes e nível do mar baseadas em modelos Copernicus/ECMWF para o canal da BTS.
3. **Modelos Físico-Químicos Acoplados da Simulação:**
   - **Oxigênio Dissolvido e DBO (`oxygen.ts`):** Cinética acoplada ar-mar baseada em Weiss (1970) para saturação termodinâmica, Streeter-Phelps para reaeração atmosférica e desoxigenação por DBO, demanda de oxigênio bentônica (SOD; Bowie et al., 1985) e fotossíntese/respiração líquida de algas e corais.
   - **Sistema Carbonato Marinho (`carbonate.ts`):** Equilíbrio termodinâmico do $\text{CO}_2$ marinho ($K_1, K_2, K_w, K_B$ de Lueker et al., 2000 e Dickson, 1990; $K'_{sp}$ de Mucci, 1983) calculando pH efetivo, $p\text{CO}_2$, saturação de aragonita ($\Omega_{\text{arag}}$) e calcita ($\Omega_{\text{calc}}$), acoplado à produção respiratória de $\text{CO}_2$.
   - **Destino e Balanço de Óleo (`contaminants.ts`):** Balanço de massa em 4 compartimentos (filme superficial, dispersão em gotículas, dissolução de HPAs biodisponíveis e deposição em sedimento) com atenuação luminosa, perdas atmosféricas e exportação oceânica hidrodinâmica.
   - **Ecotoxicologia Subletal de HPAs:** Curvas de inibição de regeneração tecidual em *Mussismilia* baseadas em May et al. (2020) com EC50 de 10 µg/L tPAH50.
   - **Microplásticos nos Estuários:** Levantamento amostral regional dos dez principais rios afluentes da BTS baseado em Trindade et al. (2023).
4. **Cenário Experimental Interativo:** Bancada didática em que o usuário manipula forçantes e observa a resposta ecossistêmica sem sobrescrever os registros observacionais externos.

## Funcionalidades

- **Cena marinha 3D em tempo real** renderizada via Babylon.js 9 com carregamento sob demanda (`React.lazy`/`Suspense`).
- **Compartimentalização por Setores da BTS:** Ilha dos Frades, Boca da Barra, Canal de Itaparica e Baía de Aratu, com batimetrias, taxas de descarga hidrodinâmica e salinidades específicas.
- **Regimes de Esgoto Selecionáveis:** Aporte contínuo diário ($\text{kg DBO}_5/\text{dia}$) ou pulso pontual instantâneo ($\Delta\text{DBO}$).
- **Monitor de Sistema Carbonato:** Graus de saturação mineral ($\Omega_{\text{arag}}$, $\Omega_{\text{calc}}$) e $p\text{CO}_2$ com alertas de risco de corrosão do esqueleto coralino.
- **Cinética de Desoxigenação:** Efeitos subletais e hipóxia severa influenciando a sobrevivência de peixes e corais.
- **DHW em janela móvel de 12 semanas:** Cumprimento estrito da metodologia Coral Reef Watch para quantificação do estresse térmico acumulado.
- **Painel de Ciência e Proveniência:** Inspeção de fórmulas, constantes, URLs de consulta externa e hashes de integridade.
- **Controles de Tempo:** Velocidades 1×, 3×, 5× e 10× com integração física independente da taxa de quadros (FPS).
- **Desafios e Marcos Pedagógicos:** Diagnóstico e recuperação de recifes degradados.

## Tecnologias

### Linguagens e Frameworks

- **TypeScript** (tipagem estrita em todo o motor de simulação e serviços).
- **React 19** para arquitetura de componentes reativos e interface.
- **Babylon.js 9** (`@babylonjs/core`, `@babylonjs/loaders`) para renderização 3D WebGL/WebGPU.
- **Tauri 2** para empacotamento desktop nativo e operação offline.
- **Vite 8** para empacotamento, compilação e tree-shaking otimizado.
- **Vitest** para testes de unidade e integração contínua das rotinas científicas.

## Executando localmente

### Pré-requisitos

- Node.js 20 ou superior.
- npm.
- Rust e ferramentas Tauri (apenas caso deseje compilar o instalador desktop nativo).

### Instalação

```bash
git clone https://github.com/EbertSoares/Kirimure.git
cd Kirimure
npm install
```

### Ambiente de desenvolvimento

```bash
npm run dev
```

### Build de produção

```bash
npm run build
```

O comando de build executa três etapas sequenciais obrigatórias:
1. `check:offline`: Auditoria estática de código que assegura que chamadas de rede estejam confinadas estritamente a `src/services/`, impedindo vazamento de dependências de rede no runtime da simulação.
2. `tsc --noEmit`: Verificação rigorosa de contratos e tipos TypeScript.
3. `vite build`: Empacotamento otimizado de produção em `dist/`.

### Testes automatizados

```bash
npm test
```

Executa a suíte de testes cobrindo o modelo de simulação, cinética de oxigênio, sistema carbonato, particionamento de contaminantes e adaptadores de proveniência de dados.

## Estrutura do Projeto

```text
src/
├── assets/               Modelos 3D, texturas e artes visuais
├── components/           Componentes de interface, gráficos e Painel de Ciência
├── hooks/
│   └── useOceanData.ts   Hook de sincronização com NOAA CRW e Open-Meteo
├── scene/                Cena 3D Babylon.js e animação procedural dos peixes
├── services/             Adaptadores de dados externos, tratamento e contingência
│   ├── noaaCrw.ts        Cliente CoastWatch ERDDAP NOAA CRW e fallback calibrado
│   ├── openMeteo.ts      Cliente Copernicus/ECMWF Open-Meteo Marine
│   └── types.ts          Tipagem estrita de proveniência de dados oceanográficos
├── simulation/           Motor de simulação científica determinística
│   ├── carbonate.ts      Equilíbrio termodinâmico do sistema carbonato (Lueker/Mucci)
│   ├── contaminants.ts   Balanço de óleo em 4 reservatórios e dados de microplásticos
│   ├── oxygen.ts         Solubilidade de Weiss e cinética DBO/OD Streeter-Phelps
│   ├── sectors.ts        Parâmetros oceanográficos e hidrodinâmicos dos setores da BTS
│   ├── model.ts          Acoplamento ecológico, cálculo de estresse e saúde
│   └── types.ts          Tipos de forçantes, estado e indicadores
├── App.tsx               Coordenação do estado, alternância de cenários e controles
└── main.tsx              Ponto de entrada da aplicação
scripts/
└── check-offline-runtime.mjs  Auditoria de desacoplamento de rede
src-tauri/                Configuração do aplicativo desktop multiplataforma
```

## Referências Científicas Principais

- **Solubilidade de Oxigênio:** Weiss, R. F. (1970). *The solubility of nitrogen, oxygen and argon in water and seawater*. Deep Sea Research, 17(4), 721-735.
- **Sistema Carbonato:** Lueker, T. J., Dickson, A. G., & Keeling, C. D. (2000). *Ocean pCO2 calculated from dissolved inorganic carbon, alkalinity, and equations for K1 and K2*. Marine Chemistry, 70(1-3), 105-119.
- **Solubilidade de Aragonita e Calcita:** Mucci, A. (1983). *The solubility of calcite and aragonite in seawater at various salinities, temperatures, and one atmosphere total pressure*. American Journal of Science, 283(7), 780-799.
- **Estresse Térmico em Corais:** NOAA Coral Reef Watch (CRW). *Daily Global 5km Satellite Coral Bleaching Heat Stress Monitoring*.
- **Ecotoxicologia em Recifes:** May, L. A., et al. (2020). *Ecotoxicological effects of petroleum hydrocarbons on tropical reef-building corals*. Aquatic Toxicology, 226, 105454.
- **Microplásticos na BTS:** Trindade, R. F., et al. (2023). *Microplastics in estuaries of Todos os Santos Bay, Bahia, Brazil*. Environmental Pollution, 321, 121224.
- **Oceanografia da BTS:** Cirano, M., & Lessa, G. C. (2007). *Oceanographic characteristics of Baía de Todos os Santos, Brazil*. Revista Brasileira de Geofísica, 25(4), 363-387.
