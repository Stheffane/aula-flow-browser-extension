import { getAdapter } from '../platforms'
import { snapshot } from '../platforms/dom'
import type { FrameReport, Message } from '../shared/types'

// Roda em todos os frames da página (o player costuma ficar num iframe).
// Cada frame responde com o que encontrou; o painel junta as respostas.
chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  // Navegação entre aulas (processamento do módulo): só o frame principal responde.
  if (msg.type === 'OPEN_LESSON') {
    const adapter = getAdapter(new URL(location.href))
    if (window !== window.top || !adapter.openLesson) return
    adapter
      .openLesson(document, msg.id)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }))
    return true
  }

  if (msg.type !== 'GET_PAGE_INFO' && msg.type !== 'GET_SNAPSHOT') return

  const url = new URL(location.href)
  const report: FrameReport = {
    frameUrl: url.href,
    isTop: window === window.top,
    info: getAdapter(url).detect(document, url),
    snapshot: msg.type === 'GET_SNAPSHOT' ? snapshot(document) : undefined,
  }
  sendResponse(report)
})
