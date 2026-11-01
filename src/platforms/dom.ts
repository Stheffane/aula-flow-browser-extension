import type { PageSnapshot, VideoSource } from '../shared/types'

const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

/** Players de vídeo comuns em plataformas de curso. */
const PLAYER_HOSTS = /mdstrm\.com|youtube\.com|youtu\.be|vimeo\.com|pandavideo|wistia|jwplayer|brightcove|kaltura|vdocipher|cloudflarestream|mediadelivery/i

/**
 * Chave de uma aula: URL da página + ID do vídeo. Em plataformas SPA (como a Platos)
 * a URL é a mesma para todas as aulas; o vídeo é o que muda.
 */
export function lessonKey(url: URL, videos: VideoSource[]) {
  const src = videos[0]?.src
  if (!src) return url.origin + url.pathname
  const video = new URL(src, url).pathname.split('/').filter(Boolean).pop()
  return `${url.origin}${url.pathname}#video-${video}`
}

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

const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'PATH', 'NOSCRIPT', 'IMG'])
const KEEP_ATTRS = /^(id|role|href|title|aria-(current|selected|expanded|label|disabled|controls)|data-[\w-]+|disabled|type)$/

/** Texto próprio do elemento (sem o texto dos filhos). */
const ownText = (el: Element) =>
  [...el.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent?.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 80)

/** Árvore compacta de um elemento: tag.classes [atributos] "texto", um por linha. */
function tree(root: Element, maxLines = 500): string[] {
  const lines: string[] = []
  const walk = (el: Element, depth: number) => {
    if (lines.length >= maxLines || SKIP.has(el.tagName.toUpperCase())) return
    const classes = [...el.classList].slice(0, 5).map((c) => '.' + c).join('')
    const attrs = [...el.attributes]
      .filter((a) => KEEP_ATTRS.test(a.name))
      .map((a) => `${a.name}="${a.value.slice(0, 80)}"`)
      .join(' ')
    const own = ownText(el)
    lines.push(`${'  '.repeat(depth)}${el.tagName.toLowerCase()}${classes}${attrs ? ` [${attrs}]` : ''}${own ? ` "${own}"` : ''}`)
    for (const child of el.children) walk(child, depth + 1)
  }
  walk(root, 0)
  if (lines.length >= maxLines) lines.push('… (cortado)')
  return lines
}

/**
 * Menu de conteúdo do curso: sobe a partir do título "Conteúdo do Curso" até o bloco que contém os módulos.
 * Serve para descobrir como a plataforma organiza módulos/aulas e marca a aula atual.
 */
function courseMenu(doc: Document): string[] {
  const title = [...doc.querySelectorAll('body *')].find((el) =>
    /^conte[uú]do do curso$/i.test(ownText(el) || (el.children.length === 0 ? text(el) : '')),
  )
  if (!title) return ['(título "Conteúdo do Curso" não encontrado)']
  let box: Element = title
  while (box.parentElement && (text(box).match(/m[óo]dulo\s*\d+/gi) ?? []).length < 2) box = box.parentElement
  return tree(box)
}

/** Botões de navegação entre aulas, com o HTML (para saber como clicar neles). */
function navButtons(doc: Document): string[] {
  return [...doc.querySelectorAll('button, a')]
    .filter((el) => /pr[óo]xima aula|aula anterior|avan[cç]ar|voltar|concluir|marcar como/i.test(text(el)))
    .map((el) => el.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').slice(0, 400))
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
    navButtons: navButtons(doc),
    courseMenu: courseMenu(doc),
  }
}
