const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Erros que não adianta repetir (chave errada, sem permissão). */
const PERMANENT = /401|403|invalid.*key|api key|unauthori[sz]ed|permission|não foi transcrita|informe a chave|per ?day|daily|exceeded your current|billing/i

/**
 * Repete a operação em falhas temporárias (limite de uso, instabilidade, tempo esgotado),
 * esperando um pouco mais a cada tentativa.
 */
export async function withRetry<T>(fn: () => Promise<T>, delays = [5_000, 20_000]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (attempt >= delays.length || PERMANENT.test(msg)) throw e
      console.warn(`Falha temporária, tentando de novo em ${delays[attempt] / 1000}s:`, msg)
      await sleep(delays[attempt])
    }
  }
}

/** Cota/limite que não volta em segundos (diário, ou cota da conta esgotada). */
export const isQuotaError = (msg: string) =>
  /per ?day|daily|quota|resource.?exhausted|exceeded your current|insufficient|billing|limit.*(day|dia)/i.test(msg) &&
  !/per ?minute|por minuto/i.test(msg)
