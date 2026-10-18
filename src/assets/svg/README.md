# Catálogo de assets visuais

> Apesar do nome histórico desta pasta, os arquivos atuais são imagens **PNG com transparência**, em 1254 × 1254 px. Os arquivos `.svg` são artes nativas criadas para a simulação.

## Estrutura

```text
svg/
  brasil-estados (1).svg    Mapa do IBGE (malha de 2025, 27 unidades federativas)
  coral/
    coral-brain-healthy.png
    coral-branching-healthy.png
    coral-branching-pale-tips.png
    coral-branching-partially-bleached.png
    coral-branching-bleached.png
  environment/
    reef-rocks-sand.png
    seaweed-green.png
  fauna/
    jellyfish-moon.svg
    squid-caribbean-reef.svg
  fish/
    fish-blue-tang-healthy.png
    fish-blue-tang-stressed.png
    fish-sergeant-major-healthy.png
    fish-sergeant-major-stressed.png
    fish-parrotfish-healthy.png
    fish-parrotfish-stressed.png
  pollution/
    microplastics-mixed.png
    microplastics-particles-dark.svg
```

## Peixes e fauna

Cada espécie tem duas artes: `-healthy` para o estado saudável e `-stressed` para o
estado de estresse. O estado morto não tem arquivo próprio: a simulação reaproveita
a arte de estresse com um tom acinzentado aplicado em tempo de execução.

| Arquivo | Espécie | Estado |
|---|---|---|
| `fish-blue-tang-healthy.png` | Cirurgião-patela (blue tang) | Saudável, cores vivas |
| `fish-blue-tang-stressed.png` | Cirurgião-patela | Estresse, cores apagadas |
| `fish-sergeant-major-healthy.png` | Sargentinho (sergeant major) | Saudável, corpo amarelo |
| `fish-sergeant-major-stressed.png` | Sargentinho | Estresse, corpo acinzentado |
| `fish-parrotfish-healthy.png` | Peixe-papagaio | Saudável, azul-turquesa |
| `fish-parrotfish-stressed.png` | Peixe-papagaio | Estresse, cores mais fechadas |
| `jellyfish-moon.svg` | Água-viva-lua | Fauna flutuante viva |
| `squid-caribbean-reef.svg` | Lula-do-recife | Fauna flutuante viva |

### Orientação das artes

A simulação espelha o peixe conforme a direção do movimento, então **toda arte de
peixe deve estar virada para a esquerda** (cabeça à esquerda, cauda à direita).
As artes de papagaio recebidas vieram viradas para a direita e foram espelhadas
horizontalmente na instalação (`sips --flip horizontal`).

## Fundo e poluição

| Arquivo | Conteúdo | Uso sugerido |
|---|---|---|
| `coral-branching-healthy.png` | Coral ramificado totalmente laranja | Estado saudável |
| `coral-branching-pale-tips.png` | Coral laranja com pontas claras | Estresse inicial |
| `coral-branching-partially-bleached.png` | Coral parcialmente branco | Branqueamento intermediário |
| `coral-branching-bleached.png` | Coral completamente branco | Branqueamento avançado |
| `coral-brain-healthy.png` | Coral-cérebro amarelo/laranja | Composição do recife saudável |
| `seaweed-green.png` | Alga marinha verde | Vegetação do recife |
| `reef-rocks-sand.png` | Rochas com base de areia | Estrutura do fundo do recife |
| `microplastics-mixed.png` | Conjunto de fragmentos plásticos coloridos | Poluição por microplásticos |
| `microplastics-particles-dark.svg` | Partículas, fibras e fragmentos escuros | Visual principal de microplásticos |

## Observações para revisão da arte

- `coral-branching-partially-bleached.png` e `coral-branching-bleached.png` possuem resíduos claros e coloridos próximos às bordas transparentes.
- Todos os arquivos têm uma área transparente grande. Antes da integração definitiva, vale recortar os limites transparentes para reduzir memória de textura.
- Todos devem continuar com transparência e sem fundo incorporado.
- Recomenda-se gerar versões WebP de produção, preservando os PNGs como arquivos-fonte.
- O mapa `brasil-estados (1).svg` tem 17 MB e não é usado diretamente no navegador: ele é a fonte de `scripts/build-brazil-map.mjs`, que gera `src/components/brazilStates.data.ts` já simplificado.
