import type { PlatformAdapter } from './types'
import type { PageKind } from '../shared/types'
import { findVideos } from './dom'

/**
 * Plataforma Platos (LMS da faculdade).
 * Ex.: https://infoprod.platosedu.io/v2/lms/aluno/disciplina/14070701
 *
 * Os seletores abaixo são iniciais: serão refinados com o "Inspecionar página"
 * do painel, rodando numa aula real.
 */
const QUIZ_WORDS = /question[aá]rio|avalia[cç][aã]o|atividade|quiz|exerc[ií]cio/i

export const platosAdapter: PlatformAdapter = {
  id: 'platos',
  name: 'Platos LMS',

  matches: (url) => url.hostname.endsWith('platosedu.io'),

  detect(doc, url) {
    const videos = findVideos(doc)
    const courseId = url.pathname.match(/disciplina\/(\d+)/)?.[1]
    const heading = doc.querySelector('h1, h2')?.textContent?.trim()

    let kind: PageKind = 'unknown'
    if (videos.length > 0) kind = 'lesson'
    else if (QUIZ_WORDS.test(heading ?? '') || doc.querySelector('input[type="radio"]')) kind = 'quiz'
    else if (courseId) kind = 'course'

    return {
      platform: this.name,
      kind,
      url: url.href,
      title: heading || doc.title,
      courseId,
      videos,
    }
  },
}
