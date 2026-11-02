import type { PlatformAdapter } from './types'
import type { OutlineModule, PageKind } from '../shared/types'
import { findVideos, lessonKey } from './dom'
import { readQuestion } from './question'

/**
 * Plataforma Platos (LMS da faculdade).
 *   Disciplina: /v2/lms/aluno/disciplina/{disciplinaId}
 *   Aula:       /v2/lms/aluno/disciplina/conteudo/{disciplinaId}/{x}/{y}
 *
 * O vídeo fica num iframe do Mediastream (mdstrm.com). A aba "Avaliação"
 * fica na mesma URL da aula e mostra o botão "Iniciar avaliação".
 */
const buttonTexts = (doc: Document) =>
  [...doc.querySelectorAll('button, a[role="button"], [role="tab"]')].map((b) => b.textContent?.trim() ?? '')

const clean = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
const ITEM = '[data-testid^="sidebar-menu-item-"]'

/**
 * Menu "Conteúdo do Curso": módulos (accordion) → aulas ([data-testid="sidebar-menu-item-<id>"]).
 * A aula aberta não tem atributo próprio: ela só tem uma classe CSS diferente das demais.
 * Por isso a "atual" é o item cuja classe aparece uma única vez na lista.
 */
function outline(doc: Document): OutlineModule[] {
  const items = [...doc.querySelectorAll<HTMLElement>(ITEM)]
  const classCount = new Map<string, number>()
  for (const el of items) classCount.set(el.className, (classCount.get(el.className) ?? 0) + 1)

  const modules = new Map<string, OutlineModule>()
  for (const el of items) {
    const name = clean(el.closest('.chakra-accordion__item')?.querySelector('h3')) || 'Aulas'
    const mod = modules.get(name) ?? { name, items: [] }
    mod.items.push({
      id: el.dataset.testid!.replace('sidebar-menu-item-', ''),
      label: [...el.querySelectorAll('h4')].map(clean).filter(Boolean).join(' · '),
      current: items.length > 2 && classCount.get(el.className) === 1,
    })
    modules.set(name, mod)
  }
  return [...modules.values()]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const currentVideo = (doc: Document) => findVideos(doc)[0]?.src

/** Espera o vídeo da página trocar (até ~10 s). */
async function waitVideoChange(doc: Document, before: string | undefined) {
  for (let t = 0; t < 35; t++) {
    await sleep(300)
    const now = currentVideo(doc)
    if (now && now !== before) return true
  }
  return false
}

/** Botão visível com o data-testid informado (a página tem uma cópia para desktop e outra para celular). */
function navButton(doc: Document, testId: string) {
  const all = [...doc.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)]
  return all.find((b) => b.offsetParent !== null) ?? all[0]
}

/**
 * Abre a aula `id`. O menu lateral não responde a cliques simulados, então a navegação usa
 * os botões "Próxima aula"/"Aula Anterior" até chegar na aula certa. O clique no menu fica como reserva.
 */
async function openLesson(doc: Document, id: string) {
  const position = () => {
    const flat = outline(doc).flatMap((m) => m.items)
    return { current: flat.findIndex((i) => i.current), target: flat.findIndex((i) => i.id === id) }
  }
  if (position().target === -1) throw new Error(`Aula ${id} não encontrada no menu.`)

  for (let step = 0; step < 40; step++) {
    const { current, target } = position()
    if (current === target && currentVideo(doc)) return
    if (current === -1) break // não dá para saber onde está: tenta pelo menu

    const button = navButton(doc, target > current ? 'button-next' : 'button-prev')
    if (!button) break
    const before = currentVideo(doc)
    button.click()
    if (!(await waitVideoChange(doc, before))) await sleep(1500) // pode ser uma página sem vídeo (podcast, avaliação)
  }

  // Reserva: clique no item do menu.
  const el = doc.querySelector<HTMLElement>(`[data-testid="sidebar-menu-item-${id}"]`)
  for (const target of [el?.querySelector<HTMLElement>('h4'), el?.querySelector<HTMLElement>('button'), el]) {
    const before = currentVideo(doc)
    target?.click()
    if ((await waitVideoChange(doc, before)) || position().current === position().target) return
  }
  throw new Error('Não consegui abrir a aula (nem pelo botão "Próxima aula", nem pelo menu).')
}

/** O nome da disciplina é o título logo antes de "Início: dd/mm/aaaa". */
function courseName(doc: Document): string | undefined {
  const headings = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => h.textContent?.trim() ?? '')
  const i = headings.findIndex((t) => /^in[ií]cio:/i.test(t))
  return i > 0 ? headings[i - 1] : undefined
}

/** Módulos do menu "Conteúdo do Curso" (botões "Módulo 01", "Módulo 02"...). */
function moduleNames(doc: Document): string[] {
  const names = [...doc.querySelectorAll('button, h1, h2, h3, h4, h5, h6')]
    .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter((t) => /^m[óo]dulo\s*\d+$/i.test(t))
  return [...new Set(names)]
}

export const platosAdapter: PlatformAdapter = {
  id: 'platos',
  name: 'Platos LMS',

  matches: (url) => url.hostname.endsWith('platosedu.io'),

  detect(doc, url) {
    const videos = findVideos(doc)
    const courseId = url.pathname.match(/disciplina\/(?:conteudo\/)?(\d+)/)?.[1]
    const isContent = url.pathname.includes('/disciplina/conteudo/')
    const isQuiz = buttonTexts(doc).some((t) => /iniciar avalia[cç][aã]o/i.test(t))

    const menu = outline(doc)
    const currentModule = menu.find((m) => m.items.some((i) => i.current))
    const currentItem = currentModule?.items.find((i) => i.current)

    let kind: PageKind = 'unknown'
    const question = readQuestion(doc)
    if (isQuiz || question) kind = 'quiz'
    else if (videos.length > 0) kind = 'lesson'
    else if (courseId && !isContent) kind = 'course'

    return {
      platform: this.name,
      kind,
      url: url.href,
      lessonKey: lessonKey(url, videos),
      title: currentItem?.label || doc.title,
      courseId,
      // Sem o nome na página, usa o número da disciplina (da URL): nunca mistura matérias diferentes.
      course: courseName(doc) ?? (courseId ? `Disciplina ${courseId}` : undefined),
      modules: moduleNames(doc),
      module: currentModule?.name,
      outline: menu,
      question,
      videos,
    }
  },

  outline,
  openLesson,
}
