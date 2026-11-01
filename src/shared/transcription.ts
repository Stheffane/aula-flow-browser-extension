/**
 * Provedores de transcrição. Groq e OpenAI usam a mesma API (formato OpenAI),
 * então trocar de provedor é só trocar URL, modelo e chave.
 */
export const PROVIDERS = {
  groq: {
    name: 'Groq (gratuito)',
    url: 'https://api.groq.com/openai/v1/audio/transcriptions',
    model: 'whisper-large-v3-turbo',
    keyUrl: 'https://console.groq.com/keys',
  },
  openai: {
    name: 'OpenAI (pago)',
    url: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'gpt-4o-mini-transcribe',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
} as const

export type ProviderId = keyof typeof PROVIDERS

export interface Transcriber {
  provider: ProviderId
  apiKey: string
}

/** Transcreve um trecho de áudio (até 25 MB). */
export async function transcribe(audio: Blob, { provider, apiKey }: Transcriber, context?: string): Promise<string> {
  const { url, model, name } = PROVIDERS[provider]
  const form = new FormData()
  form.append('file', audio, 'aula.webm')
  form.append('model', model)
  form.append('language', 'pt')
  // O título da aula ajuda o modelo com termos técnicos.
  if (context) form.append('prompt', context)

  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(`${name}: ${body?.error?.message ?? `erro ${res.status}`}`)
  }
  const data: { text: string } = await res.json()
  return data.text
}
