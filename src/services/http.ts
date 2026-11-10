/**
 * Camada HTTP compartilhada dos clientes de dados externos.
 *
 * Objetivos:
 * - O timeout cobre a operação COMPLETA (cabeçalhos + leitura do corpo), e não apenas a chegada dos cabeçalhos;
 * - Toda falha é classificada em uma categoria diagnóstica explícita, preservando a causa real
 *   (status HTTP, mensagem do servidor, tempo gasto e URL) para exibição na interface.
 */

export type RemoteErrorKind =
  | 'timeout' // a operação completa excedeu o limite de espera
  | 'network' // falha de conexão / DNS / bloqueio do navegador (inclui possíveis bloqueios CORS)
  | 'http' // o servidor respondeu com status de erro
  | 'no_data' // o servidor respondeu, mas não há valor válido para o pixel/período
  | 'no_coverage' // região sem cobertura direta no produto de satélite (e.g. canal estuarino mascarado como continente)
  | 'parse'; // a resposta chegou, mas em formato inesperado

export class RemoteDataError extends Error {
  readonly kind: RemoteErrorKind;
  readonly status?: number;
  readonly url?: string;
  readonly elapsedMs?: number;
  readonly serverMessage?: string;
  readonly source?: string;

  constructor(
    kind: RemoteErrorKind,
    message: string,
    details: { status?: number; url?: string; elapsedMs?: number; serverMessage?: string; source?: string } = {},
  ) {
    super(message);
    this.name = 'RemoteDataError';
    this.kind = kind;
    this.status = details.status;
    this.url = details.url;
    this.elapsedMs = details.elapsedMs;
    this.serverMessage = details.serverMessage;
    this.source = details.source;
  }
}

export interface TextResponse {
  status: number;
  text: string;
  elapsedMs: number;
}

/**
 * Extrai a mensagem legível de um corpo de erro do ERDDAP
 * (formato `Error { code=404; message="..."; }`) ou devolve um trecho do texto.
 */
function extractServerMessage(body: string): string | undefined {
  if (!body) return undefined;
  const erddap = body.match(/message="([\s\S]*?)";/);
  if (erddap?.[1]) return erddap[1].replace(/\\"/g, '"').trim().slice(0, 400);
  try {
    const json = JSON.parse(body);
    if (typeof json?.reason === 'string') return json.reason.slice(0, 400);
    if (typeof json?.message === 'string') return json.message.slice(0, 400);
  } catch {
    // corpo não-JSON
  }
  const plain = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain ? plain.slice(0, 200) : undefined;
}

/**
 * Executa GET e lê o corpo completo dentro do mesmo limite de tempo.
 * Respostas HTTP de erro são convertidas em RemoteDataError('http') com a mensagem do servidor.
 */
export async function fetchTextWithTimeout(
  url: string,
  options: { timeoutMs: number; accept: string; source: string },
): Promise<TextResponse> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: options.accept },
      signal: controller.signal,
    });
    // O temporizador permanece ativo durante a leitura do corpo.
    const text = await response.text();
    const elapsedMs = Date.now() - startedAt;

    if (!response.ok) {
      const serverMessage = extractServerMessage(text);
      throw new RemoteDataError(
        'http',
        `${options.source} respondeu HTTP ${response.status}${serverMessage ? `: ${serverMessage}` : ''}`,
        { status: response.status, url, elapsedMs, serverMessage, source: options.source },
      );
    }

    return { status: response.status, text, elapsedMs };
  } catch (err) {
    if (err instanceof RemoteDataError) throw err;
    const elapsedMs = Date.now() - startedAt;
    const isAbort = controller.signal.aborted
      || (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'));
    if (isAbort) {
      throw new RemoteDataError(
        'timeout',
        `${options.source} não concluiu a resposta em ${Math.round(options.timeoutMs / 1000)} s (cabeçalhos + corpo).`,
        { url, elapsedMs, source: options.source },
      );
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new RemoteDataError(
      'network',
      `Falha de conexão com ${options.source} (${detail}). Possíveis causas: servidor inacessível, rede offline ou bloqueio do navegador (CORS).`,
      { url, elapsedMs, serverMessage: detail, source: options.source },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Indica se uma falha é transitória e justifica uma nova tentativa. */
function isTransient(err: unknown): boolean {
  if (!(err instanceof RemoteDataError)) return false;
  if (err.kind === 'timeout' || err.kind === 'network') return true;
  return err.kind === 'http' && (err.status ?? 0) >= 500;
}

/** Executa a operação com até `retries` repetições em falhas transitórias. */
export async function withRetry<T>(operation: () => Promise<T>, retries = 1, delayMs = 800): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt >= retries || !isTransient(err)) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

/** Garante número finito (rejeita null, undefined, NaN, Infinity). */
export function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
