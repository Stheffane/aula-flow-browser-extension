/**
 * Geração do material de estudo a partir da transcrição.
 * O resultado é Markdown: fácil de mostrar no painel e de converter para Google Docs depois.
 */
export const SUMMARY_PROVIDERS = {
  gemini: { name: 'Gemini (gratuito)', model: 'gemini-flash-latest', keyUrl: 'https://aistudio.google.com/apikey' },
  groq: { name: 'Groq (gratuito, aulas curtas)', model: 'openai/gpt-oss-120b', keyUrl: 'https://console.groq.com/keys' },
} as const

/** Se a IA não responder nesse tempo, o resumo vira erro (em vez de ficar "gerando" para sempre). */
const TIMEOUT_MS = 3 * 60_000

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

async function withGemini(title: string, transcript: string, apiKey: string, context?: string) {
  const { model, name } = SUMMARY_PROVIDERS.gemini
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt(title, transcript, context) }] }],
      generationConfig: { temperature: 0.3 },
    }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, name))
  const data = await res.json()
  const text: string | undefined = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
  if (!text) throw new Error(`${name}: resposta vazia (${data.candidates?.[0]?.finishReason ?? 'sem motivo'})`)
  return text
}

async function withGroq(title: string, transcript: string, apiKey: string, context?: string) {
  const { model, name } = SUMMARY_PROVIDERS.groq
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(title, transcript, context) },
      ],
    }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, name))
  const data = await res.json()
  return data.choices[0].message.content as string
}

export function summarize(provider: SummaryProviderId, title: string, transcript: string, apiKey: string, context?: string) {
  return provider === 'gemini'
    ? withGemini(title, transcript, apiKey, context)
    : withGroq(title, transcript, apiKey, context)
}
