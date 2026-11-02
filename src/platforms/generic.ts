import type { PlatformAdapter } from './types'
import { findVideos, lessonKey } from './dom'
import { readQuestion } from './question'

/** Fallback para qualquer site: só detecta se há vídeo na página. */
export const genericAdapter: PlatformAdapter = {
  id: 'generic',
  name: 'Genérico',
  matches: () => true,
  detect(doc, url) {
    const videos = findVideos(doc)
    const question = readQuestion(doc)
    return {
      platform: this.name,
      kind: question ? 'quiz' : videos.length ? 'lesson' : 'unknown',
      question,
      url: url.href,
      lessonKey: lessonKey(url, videos),
      title: doc.title,
      videos,
    }
  },
}
