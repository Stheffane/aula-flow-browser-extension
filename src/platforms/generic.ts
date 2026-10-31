import type { PlatformAdapter } from './types'
import { findVideos } from './dom'

/** Fallback para qualquer site: só detecta se há vídeo na página. */
export const genericAdapter: PlatformAdapter = {
  id: 'generic',
  name: 'Genérico',
  matches: () => true,
  detect(doc, url) {
    const videos = findVideos(doc)
    return {
      platform: this.name,
      kind: videos.length ? 'lesson' : 'unknown',
      url: url.href,
      title: doc.title,
      videos,
    }
  },
}
