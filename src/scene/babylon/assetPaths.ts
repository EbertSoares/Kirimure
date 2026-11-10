/**
 * Resolve caminhos de arquivos públicos a partir da base do Vite.
 *
 * O projeto usa `base: './'` para funcionar também em subdiretórios e em
 * hospedagem estática. Caminhos iniciados por `/` ignoram essa base; por isso
 * texturas e modelos do Babylon passam por aqui antes de ir para a rede.
 */
export function assetUrl(path: string): string {
  const normalized = path.replace(/^\/+/, '');
  return `${import.meta.env.BASE_URL}${normalized}`;
}
