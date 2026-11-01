import type { Job, Transcript } from './types'
import type { ProviderId } from './transcription'

export interface Settings {
  transcriptionProvider: ProviderId
  /** Uma chave por provedor, para poder alternar sem redigitar. */
  apiKeys: Record<ProviderId, string>
  /** Velocidade do vídeo durante a captura. Acima de 1.5x a transcrição perde qualidade. */
  playbackRate: number
}

/** Tudo que a extensão guarda em chrome.storage.local. */
export interface StorageShape {
  settings: Settings
  job: Job | null
  transcripts: Record<string, Transcript>
}

export const DEFAULTS: StorageShape = {
  settings: { transcriptionProvider: 'groq', apiKeys: { groq: '', openai: '' }, playbackRate: 1 },
  job: null,
  transcripts: {},
}

/** Completa com os valores padrão (útil quando novos campos de configuração são adicionados). */
export function withDefaults<K extends keyof StorageShape>(key: K, value: unknown): StorageShape[K] {
  if (value == null) return DEFAULTS[key]
  if (key === 'settings') return { ...DEFAULTS.settings, ...(value as object) } as StorageShape[K]
  return value as StorageShape[K]
}

export async function getItem<K extends keyof StorageShape>(key: K): Promise<StorageShape[K]> {
  const data = await chrome.storage.local.get(key)
  return withDefaults(key, data[key])
}

export function setItem<K extends keyof StorageShape>(key: K, value: StorageShape[K]) {
  return chrome.storage.local.set({ [key]: value })
}
