import { getAdapter } from '../platforms'
import { snapshot } from '../platforms/dom'
import type { FrameReport, Message } from '../shared/types'

// Roda em todos os frames da página (o player costuma ficar num iframe).
// Cada frame responde com o que encontrou; o painel junta as respostas.
chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
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
