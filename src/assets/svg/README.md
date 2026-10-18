# Catálogo de assets visuais

> Apesar do nome histórico desta pasta, os arquivos atuais são imagens **PNG com transparência**, em 1254 × 1254 px. Não são SVGs vetoriais.

## Estrutura

```text
svg/
  coral/
    coral-brain-healthy.png
    coral-branching-healthy.png
    coral-branching-pale-tips.png
    coral-branching-partially-bleached.png
    coral-branching-bleached.png
  environment/
    reef-rocks-sand.png
    seaweed-green.png
  fish/
    fish-blue-tang-healthy.png
    fish-blue-tang-stressed.png
    fish-blue-tang-dead.png
  pollution/
    microplastics-mixed.png
    microplastics-particles-dark.svg
```

## Uso previsto

| Arquivo | Conteúdo | Uso sugerido |
|---|---|---|
| `fish-blue-tang-healthy.png` | Peixe cirurgião-patela azul e amarelo | Estado saudável dos peixes |
| `fish-blue-tang-stressed.png` | Mesmo peixe com contorno vermelho | Estado de estresse ou alerta |
| `fish-blue-tang-dead.png` | Mesmo peixe com coloração apagada e olho em X | Estado morto |
| `coral-branching-healthy.png` | Coral ramificado totalmente laranja | Estado saudável |
| `coral-branching-pale-tips.png` | Coral laranja com pontas claras | Estresse inicial |
| `coral-branching-partially-bleached.png` | Coral parcialmente branco | Branqueamento intermediário |
| `coral-branching-bleached.png` | Coral completamente branco | Branqueamento avançado |
| `coral-brain-healthy.png` | Coral-cérebro amarelo/laranja | Composição do recife saudável |
| `microplastics-mixed.png` | Conjunto de fragmentos plásticos coloridos | Poluição por microplásticos |
| `microplastics-particles-dark.svg` | Partículas, fibras e fragmentos escuros | Visual principal de microplásticos na simulação |
| `seaweed-green.png` | Alga marinha verde | Vegetação do recife |
| `reef-rocks-sand.png` | Rochas com base de areia | Estrutura do fundo do recife |

## Observações para revisão da arte

- O contorno vermelho de `fish-blue-tang-stressed.png` é muito intenso e pode parecer um efeito de seleção da interface.
- `coral-branching-partially-bleached.png` e `coral-branching-bleached.png` possuem resíduos claros e coloridos próximos às bordas transparentes.
- Todos os arquivos têm uma área transparente grande. Antes da integração definitiva, vale recortar os limites transparentes para reduzir memória de textura.
- Todos devem continuar com transparência e sem fundo incorporado.
- Recomenda-se gerar versões WebP de produção, preservando os PNGs como arquivos-fonte.
