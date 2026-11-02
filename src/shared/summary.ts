import { cleanTranscript } from './clean'
import { isQuotaError, withRetry } from './retry'

/**
 * Geração do material de estudo a partir da transcrição.
 * O resultado é Markdown: fácil de mostrar no painel e de converter para Google Docs depois.
 */
export const SUMMARY_PROVIDERS = {
  gemini: { name: 'Gemini Flash (gratuito)', model: 'gemini-flash-latest', key: 'gemini', batch: true },
  'gemini-lite': { name: 'Gemini Flash-Lite (gratuito)', model: 'gemini-flash-lite-latest', key: 'gemini', batch: true },
  // Groq tem limite baixo de texto por minuto: só aula a aula, nunca o módulo inteiro de uma vez.
  groq: { name: 'Groq gpt-oss (gratuito, aulas curtas)', model: 'openai/gpt-oss-120b', key: 'groq', batch: false },
} as const

/** Se a IA não responder nesse tempo, o resumo vira erro (em vez de ficar "gerando" para sempre). */
const TIMEOUT_MS = 6 * 60_000

export type SummaryProviderId = keyof typeof SUMMARY_PROVIDERS

const SYSTEM_PROMPT = `Você é um tutor que transforma a transcrição de uma videoaula em material de estudo claro, em português do Brasil.

A transcrição é de fala espontânea: tem repetições, vícios de linguagem ("perfeito", "beleza", "então"), frases soltas e erros de reconhecimento de voz. O professor nem sempre explica bem o porquê das coisas. Seu trabalho é organizar e explicar melhor, não só resumir.

Regras:
- Não invente fatos sobre o que aconteceu na aula. Quando você acrescentar uma explicação, exemplo ou contexto que NÃO veio da aula, marque com "💡 Complemento:".
- Corrija termos técnicos mal transcritos quando o contexto deixar claro (ex.: "npm-ci" → "npm ci", "Pixie.js" → "PixiJS").
- Explique cada conceito como se fosse para alguém que se perdeu na explicação original: o que é, para que serve e por que foi usado ali.
- Seja direto. Nada de introduções genéricas.
- O tamanho deve ser proporcional ao conteúdo: aula curta ou só introdutória gera material curto. Não estique seções para preencher.
- Omita as seções que não se aplicarem (exceto "Em uma frase" e "Resumo").

Responda APENAS com Markdown, nesta estrutura:

# {título da aula}

## Em uma frase
O objetivo da aula, em uma frase.

## Resumo
Um parágrafo curto com a ideia geral e como as partes se conectam.

## Conceitos principais
### {Conceito}
Explicação clara. Use analogia ou exemplo quando ajudar.

## Passo a passo da aula
Lista numerada do que foi feito, na ordem (comandos, arquivos, configurações). Use blocos de código para comandos e trechos de código citados.

## Pontos de atenção
Erros comuns, configurações necessárias e avisos que o professor deu.

## Atividades e projetos
Tudo que foi pedido ou sugerido para o aluno fazer, com as especificações citadas (arquivos, links mencionados, requisitos, critérios). Deixe claro o que é obrigatório e o que é sugestão.

## Materiais complementares
Links, repositórios, arquivos, ferramentas, bibliotecas e leituras citados na aula (com o nome exato e para que servem). Pode sugerir outros, marcados com "💡 Complemento:".

## Glossário
- **Termo**: definição curta.

## Perguntas para revisão
3 a 5 perguntas, cada uma seguida da resposta em uma linha começando com "Resposta:".`

const userPrompt = (title: string, transcript: string, context?: string) =>
  [
    `Título da aula: ${title}`,
    context &&
      `Aulas anteriores deste curso e os conceitos que já foram explicados nelas. Não repita essas explicações: quando um desses conceitos aparecer, explique só o que for novo e faça referência à aula anterior.\n${context}`,
    `Transcrição:\n"""\n${transcript}\n"""`,
  ]
    .filter(Boolean)
    .join('\n\n')

async function errorMessage(res: Response, name: string) {
  const body = await res.json().catch(() => null)
  return `${name}: ${body?.error?.message ?? `erro ${res.status}`}`
}

async function withGemini(id: 'gemini' | 'gemini-lite', system: string, user: string, apiKey: string) {
  const { model, name } = SUMMARY_PROVIDERS[id]
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.3 },
    }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, name))
  const data = await res.json()
  const text: string | undefined = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
  if (!text) throw new Error(`${name}: resposta vazia (${data.candidates?.[0]?.finishReason ?? 'sem motivo'})`)
  return text
}

async function withGroq(system: string, user: string, apiKey: string) {
  const { model, name } = SUMMARY_PROVIDERS.groq
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, name))
  const data = await res.json()
  return data.choices[0].message.content as string
}

/** Último sinal de vida de uma chamada de IA (o vigia do processamento usa para saber se ela ainda está rodando). */
export const AI_HEARTBEAT = 'aiHeartbeat'

/**
 * O Chrome encerra o service worker quando a resposta de um fetch demora mais de 30 s, e o material
 * de um módulo leva minutos. Chamar uma API da extensão a cada 20 s reinicia esse prazo.
 */
async function keepAlive<T>(work: () => Promise<T>): Promise<T> {
  const beat = () => chrome.storage.session.set({ [AI_HEARTBEAT]: Date.now() }).catch(() => undefined)
  beat()
  const timer = setInterval(beat, 20_000)
  try {
    return await work()
  } finally {
    clearInterval(timer)
  }
}

/** Chamada genérica ao provedor de IA escolhido (usada pelo resumo e pelo tutor). */
export function complete(provider: SummaryProviderId, system: string, user: string, apiKey: string) {
  return keepAlive(() => (provider === 'groq' ? withGroq(system, user, apiKey) : withGemini(provider, system, user, apiKey)))
}

type ApiKeys = Record<'groq' | 'openai' | 'gemini', string>

/** Ordem de tentativa: o provedor escolhido nas configurações e depois os outros gratuitos. */
const providerChain = (primary: SummaryProviderId): SummaryProviderId[] => [
  ...new Set<SummaryProviderId>([primary, 'gemini', 'gemini-lite', 'groq']),
]

/** Provedores que responderam "limite diário atingido": pulados por 1 h (evita chamadas perdidas). */
const exhausted = new Map<SummaryProviderId, number>()
const EXHAUSTED_MS = 60 * 60_000

/**
 * Chama a IA com reserva automática: se um provedor falhar (limite diário, instabilidade),
 * tenta o próximo da lista. Com `batch`, só usa provedores que aguentam textos grandes.
 */
export async function completeWithFallback(
  system: string,
  user: string,
  opts: { primary: SummaryProviderId; apiKeys: ApiKeys; batch?: boolean },
) {
  const errors: string[] = []
  for (const id of providerChain(opts.primary)) {
    const provider = SUMMARY_PROVIDERS[id]
    const apiKey = opts.apiKeys[provider.key]
    if (!apiKey || (opts.batch && !provider.batch)) continue
    if (Date.now() - (exhausted.get(id) ?? 0) < EXHAUSTED_MS) {
      errors.push(`${provider.name}: limite diário atingido (pulado)`)
      continue
    }
    try {
      const text = await withRetry(() => complete(id, system, user, apiKey))
      return { text, model: provider.model }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isQuotaError(msg)) exhausted.set(id, Date.now())
      errors.push(msg)
    }
  }
  throw new Error(errors.length ? errors.join(' | ') : 'Nenhum provedor de IA com chave configurada.')
}

/** Material de uma aula (com reserva automática entre provedores). */
export function summarize(
  title: string,
  transcript: string,
  opts: { primary: SummaryProviderId; apiKeys: ApiKeys },
  context?: string,
) {
  return completeWithFallback(SYSTEM_PROMPT, userPrompt(title, cleanTranscript(transcript), context), opts)
}

/** Separador entre as aulas na resposta do material por módulo. */
const MARK = (n: number) => `===AULA ${n}===`

/**
 * Material de várias aulas do mesmo módulo numa única chamada (economiza requisições da cota diária).
 * Retorna o Markdown de cada aula, na mesma ordem (undefined se a IA pulou alguma).
 */
export async function summarizeBatch(
  lessons: { title: string; transcript: string }[],
  opts: { primary: SummaryProviderId; apiKeys: ApiKeys },
  context?: string,
) {
  // Uma aula só: não precisa do formato em lote.
  if (lessons.length === 1) {
    const { text, model } = await summarize(lessons[0].title, lessons[0].transcript, opts, context)
    return { markdowns: [text], model }
  }

  const user = [
    `Você vai receber ${lessons.length} aulas do mesmo módulo, em ordem. Gere o material de CADA aula separadamente, seguindo exatamente a estrutura pedida. Antes do material de cada aula, escreva uma linha contendo apenas ${MARK(1)}, ${MARK(2)} e assim por diante. Como são aulas do mesmo módulo, não repita explicações: se um conceito já foi explicado numa aula anterior, faça referência a ela.`,
    context &&
      `Aulas de módulos anteriores e os conceitos já explicados nelas (não repita essas explicações, só referencie):\n${context}`,
    ...lessons.map(
      (l, i) => `${MARK(i + 1)}\nTítulo da aula: ${l.title}\nTranscrição:\n"""\n${cleanTranscript(l.transcript)}\n"""`,
    ),
  ]
    .filter(Boolean)
    .join('\n\n')

  const { text, model } = await completeWithFallback(SYSTEM_PROMPT, user, { ...opts, batch: true })
  const parts = text.split(/^\s*===\s*AULA\s+(\d+)\s*===\s*$/m)
  const result: (string | undefined)[] = new Array(lessons.length).fill(undefined)
  for (let i = 1; i < parts.length; i += 2) {
    const n = Number(parts[i]) - 1
    const md = parts[i + 1]?.trim()
    if (n >= 0 && n < lessons.length && md) result[n] = md
  }
  return { markdowns: result, model }
}
