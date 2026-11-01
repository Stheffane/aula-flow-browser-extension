import type { Transcriber } from './transcription'

export type PageKind = 'lesson' | 'quiz' | 'course' | 'unknown'

export interface VideoSource {
  /** 'html5' = <video> na página; 'iframe' = player embutido (YouTube, Vimeo, Panda...) */
  type: 'html5' | 'iframe'
  src: string
  duration?: number
}

export interface PageInfo {
  platform: string
  kind: PageKind
  url: string
  title: string
  courseId?: string
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
}

export interface LessonRef {
  url: string
  title: string
}

export type JobStatus = 'recording' | 'transcribing' | 'done' | 'error'

/** Transcrição em andamento (uma por vez). */
export interface Job {
  lesson: LessonRef
  status: JobStatus
  segmentsDone: number
  startedAt: number
  /** Texto já transcrito até agora (aparece ao vivo no painel). */
  preview: string
  error?: string
}

export interface Transcript {
  title: string
  text: string
  createdAt: number
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
  // background → offscreen
  | { type: 'OFFSCREEN_START'; streamId: string }
  // player/offscreen → background
  | { type: 'AUDIO_SEGMENT'; dataUrl: string }
  | { type: 'CAPTURE_FINISHED' }
  | { type: 'CAPTURE_FAILED'; error: string }

export type FrameReport = { frameUrl: string; isTop: boolean; info: PageInfo; snapshot?: PageSnapshot }
