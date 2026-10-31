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
}

export type Message =
  | { type: 'GET_PAGE_INFO' }
  | { type: 'GET_SNAPSHOT' }

export type FrameReport = { frameUrl: string; isTop: boolean; info: PageInfo; snapshot?: PageSnapshot }
