import type { PlatformAdapter } from './types'
import type { PageKind } from '../shared/types'
import { findVideos } from './dom'

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

/** Item da lista "Conteúdo do Curso" marcado como atual (ajustar com o inspetor). */
function activeLessonTitle(doc: Document): string | undefined {
  const el = doc.querySelector('[aria-current="true"], [aria-current="page"], [aria-selected="true"]')
  return el?.textContent?.replace(/\s+/g, ' ').trim() || undefined
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

    let kind: PageKind = 'unknown'
    if (isQuiz) kind = 'quiz'
    else if (videos.length > 0) kind = 'lesson'
    else if (courseId && !isContent) kind = 'course'

    return {
      platform: this.name,
      kind,
      url: url.href,
      title: activeLessonTitle(doc) ?? doc.title,
      courseId,
      course: courseName(doc),
      modules: moduleNames(doc),
      videos,
    }
  },
}
