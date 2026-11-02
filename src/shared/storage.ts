import type { CourseDoc, Job, LessonMeta, Run, Summary, Transcript } from './types'
import type { ProviderId } from './transcription'
import type { SummaryProviderId } from './summary'

/** Serviços que precisam de chave. A do Groq serve para transcrição e resumo; a do Gemini, para Flash e Flash-Lite. */
export type KeyId = ProviderId | 'gemini'

export interface Settings {
  transcriptionProvider: ProviderId
  summaryProvider: SummaryProviderId
  /** Uma chave por serviço, para poder alternar sem redigitar. */
  apiKeys: Record<KeyId, string>
  /** Velocidade do vídeo durante a captura. Acima de 1.5x a transcrição perde qualidade. */
  playbackRate: number
  /** Gmail sugerido no login do Google (opcional). */
  googleEmail: string
  /** Silencia a aba durante o processamento de módulo/curso (a gravação não é afetada). */
  muteTabWhileProcessing: boolean
}

/** Tudo que a extensão guarda em chrome.storage.local. As chaves dos registros são as URLs das aulas. */
export interface StorageShape {
  settings: Settings
  job: Job | null
  /** Processamento de módulo em andamento (etapa 5). */
  run: Run | null
  transcripts: Record<string, Transcript>
  summaries: Record<string, Summary>
  lessonMeta: Record<string, LessonMeta>
  /** Um Google Docs por curso (chave: nome do curso). */
  courseDocs: Record<string, CourseDoc>
  /** Nome escolhido para o documento de cada curso/matéria (vazio = nome automático). */
  courseTitles: Record<string, string>
}

export const DEFAULTS: StorageShape = {
  settings: {
    transcriptionProvider: 'groq',
    summaryProvider: 'gemini',
    apiKeys: { groq: '', openai: '', gemini: '' },
    playbackRate: 1,
    googleEmail: '',
    muteTabWhileProcessing: false,
  },
  job: null,
  run: null,
  transcripts: {},
  summaries: {},
  lessonMeta: {},
  courseDocs: {},
  courseTitles: {},
}

/** Completa com os valores padrão (útil quando novos campos de configuração são adicionados). */
export function withDefaults<K extends keyof StorageShape>(key: K, value: unknown): StorageShape[K] {
  if (value == null) return DEFAULTS[key]
  if (key === 'settings') {
    const v = value as Partial<Settings>
    return { ...DEFAULTS.settings, ...v, apiKeys: { ...DEFAULTS.settings.apiKeys, ...v.apiKeys } } as StorageShape[K]
  }
  return value as StorageShape[K]
}

export async function getItem<K extends keyof StorageShape>(key: K): Promise<StorageShape[K]> {
  const data = await chrome.storage.local.get(key)
  return withDefaults(key, data[key])
}

export function setItem<K extends keyof StorageShape>(key: K, value: StorageShape[K]) {
  return chrome.storage.local.set({ [key]: value })
}

/** Atualiza um item de um registro (ex.: o resumo de uma aula) sem sobrescrever os outros. */
export async function setRecord<K extends 'transcripts' | 'summaries' | 'lessonMeta' | 'courseDocs' | 'courseTitles'>(key: K, id: string, value: StorageShape[K][string]) {
  const all = await getItem(key)
  await setItem(key, { ...all, [id]: value } as StorageShape[K])
}
