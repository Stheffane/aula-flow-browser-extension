import type { Transcriber } from './transcription'

export type PageKind = 'lesson' | 'quiz' | 'course' | 'unknown'

export interface VideoSource {
  /** 'html5' = <video> na página; 'iframe' = player embutido (YouTube, Vimeo, Panda...) */
  type: 'html5' | 'iframe'
  src: string
  duration?: number
}

/** Uma aula no menu do curso. */
export interface OutlineItem {
  /** ID da aula na plataforma (ex.: "89332"). */
  id: string
  label: string
  current: boolean
}

export interface OutlineModule {
  name: string
  items: OutlineItem[]
}

/** Pergunta de questionário lida da página. */
export interface Question {
  statement: string
  options: string[]
  /** Mais de uma alternativa pode ser marcada. */
  multiple: boolean
}

export interface PageInfo {
  platform: string
  kind: PageKind
  url: string
  /**
   * Identifica a aula. Em plataformas SPA a URL não muda entre aulas,
   * então a chave combina a URL com o ID do vídeo.
   */
  lessonKey: string
  title: string
  courseId?: string
  /** Nome do curso/disciplina, quando a plataforma mostra. */
  course?: string
  /** Módulos listados no menu do curso (para o seletor de módulo). */
  modules?: string[]
  /** Módulo da aula atual, quando a plataforma indica. */
  module?: string
  /** Menu do curso: módulos e aulas (para processar um módulo inteiro). */
  outline?: OutlineModule[]
  /** Pergunta visível na tela (questionários/avaliações). */
  question?: Question
  videos: VideoSource[]
}

/** Resumo da estrutura da página, usado para ajustar os adaptadores. */
export interface PageSnapshot {
  url: string
  title: string
  headings: string[]
  iframes: string[]
  videos: string[]
  buttons: string[]
  active: string[]
  navButtons: string[]
  courseMenu: string[]
  /** Pergunta lida pelo leitor genérico + estrutura do bloco (para ajustar a leitura). */
  question?: Question
  questionTree?: string[]
}

export interface LessonRef {
  /** Chave da aula (PageInfo.lessonKey). */
  url: string
  title: string
  /** Nome do curso/disciplina (usado para a pasta no Google Drive). */
  course?: string
  module?: string
}

export type JobStatus = 'recording' | 'transcribing' | 'done' | 'error'

/** Transcrição em andamento (uma por vez). */
export interface Job {
  lesson: LessonRef
  status: JobStatus
  segmentsDone: number
  startedAt: number
  /** Última mudança (o vigia usa para detectar etapas travadas). */
  updatedAt?: number
  /** Texto já transcrito até agora (aparece ao vivo no painel). */
  preview: string
  error?: string
}

export interface Transcript {
  title: string
  course?: string
  text: string
  createdAt: number
}

export interface Summary {
  status: 'loading' | 'done' | 'error'
  markdown?: string
  error?: string
  model?: string
  createdAt: number
}

/** Informações da aula definidas por você no painel (ex.: módulo). */
export interface LessonMeta {
  module?: string
  /** Posição da aula no módulo (para ordenar o documento como no menu). */
  order?: number
}

/** Aula a processar: item do menu + módulo e posição dentro dele. */
export interface RunItemInput extends OutlineItem {
  module: string
  order: number
}

/** Processamento automático de um módulo (ou do curso inteiro). */
export interface Run {
  tabId: number
  course?: string
  /** O que está sendo processado (ex.: "Módulo 04" ou "Curso inteiro"). */
  label: string
  items: (RunItemInput & {
    /** transcribed = vídeo transcrito, material ainda não gerado (sai na fase 2, por módulo). */
    status: 'pending' | 'running' | 'done' | 'skipped' | 'transcribed' | 'error'
    /** Chave da aula, quando já foi aberta. */
    key?: string
    error?: string
  })[]
  index: number
  status: 'running' | 'stopped' | 'done' | 'error'
  error?: string
  /** 1) transcrever todas as aulas; 2) gerar os materiais por módulo. */
  phase: 'transcribe' | 'summarize'
  /** Módulo cujo material está sendo gerado agora (fase 2). */
  summarizing?: string
  updatedAt?: number
  /** A extensão silenciou a aba e deve devolver o som no fim. */
  muted?: boolean
}

/** Google Docs único de um curso. */
export interface CourseDoc {
  id: string
  url: string
  updatedAt: number
}

export type Message =
  // painel → página
  | { type: 'GET_PAGE_INFO' }
  | { type: 'GET_SNAPSHOT' }
  | { type: 'PLAYER_RECORD'; rate: number } // grava o áudio direto do <video>
  | { type: 'PLAYER_START'; rate: number } // só dá play (usado no plano B, captura da aba)
  | { type: 'PLAYER_PAUSE' } // pausa e encerra a gravação
  // player → extensão
  | { type: 'PLAYER_STATUS'; currentTime: number; duration: number }
  | { type: 'PLAYER_ENDED' }
  // painel → background
  | { type: 'JOB_START'; lesson: LessonRef; transcriber: Transcriber }
  | { type: 'CAPTURE_REQUEST'; streamId: string } // plano B: captura da aba via offscreen
  | { type: 'CAPTURE_STOP' }
  | { type: 'SUMMARIZE'; lessonUrl: string }
  | { type: 'UPDATE_COURSE_DOC'; course: string }
  | { type: 'RUN_START'; tabId: number; course?: string; label: string; items: RunItemInput[] }
  | { type: 'RUN_STOP' }
  | { type: 'EXPLAIN_QUESTION'; course?: string; question: Question }
  // background → página
  | { type: 'OPEN_LESSON'; id: string }
  // background → offscreen
  | { type: 'OFFSCREEN_START'; streamId: string }
  // player/offscreen → background
  | { type: 'AUDIO_SEGMENT'; dataUrl: string }
  | { type: 'CAPTURE_FINISHED' }
  | { type: 'CAPTURE_FAILED'; error: string }

export type FrameReport = { frameUrl: string; isTop: boolean; info: PageInfo; snapshot?: PageSnapshot }
