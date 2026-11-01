import type { PageSnapshot, VideoSource } from '../shared/types'

const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

/** Players de vídeo comuns em plataformas de curso. */
const PLAYER_HOSTS = /mdstrm\.com|youtube\.com|youtu\.be|vimeo\.com|pandavideo|wistia|jwplayer|brightcove|kaltura|vdocipher|cloudflarestream|mediadelivery/i

export function findVideos(doc: Document): VideoSource[] {
  const html5 = [...doc.querySelectorAll('video')].map<VideoSource>((v) => ({
    type: 'html5',
    src: v.currentSrc || v.src || v.querySelector('source')?.src || '(blob/stream)',
    duration: Number.isFinite(v.duration) ? Math.round(v.duration) : undefined,
  }))
  const iframes = [...doc.querySelectorAll('iframe')]
    .map((f) => f.src)
    .filter((src) => PLAYER_HOSTS.test(src))
    .map<VideoSource>((src) => ({ type: 'iframe', src }))
  return [...html5, ...iframes]
}

export function snapshot(doc: Document): PageSnapshot {
  const unique = (list: string[]) => [...new Set(list.filter(Boolean))]
  return {
    url: doc.location.href,
    title: doc.title,
    headings: unique([...doc.querySelectorAll('h1,h2,h3,h4')].map(text)).slice(0, 40),
    iframes: unique([...doc.querySelectorAll('iframe')].map((f) => f.src)),
    videos: unique([...doc.querySelectorAll('video')].map((v) => v.currentSrc || v.src || '(sem src)')),
    // Elementos marcados como atuais/selecionados: ajudam a achar a aula ativa no menu.
    active: unique(
      [...doc.querySelectorAll('[aria-current], [aria-selected="true"], [class*="active"], [class*="selected"]')].map(
        (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} → ${text(el).slice(0, 80)}`,
      ),
    ).slice(0, 20),
    buttons: unique([...doc.querySelectorAll('button, a[role="button"], [role="tab"]')].map(text))
      .filter((t) => t.length < 60)
      .slice(0, 60),
  }
}
