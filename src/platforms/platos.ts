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
      videos,
    }
  },
}
