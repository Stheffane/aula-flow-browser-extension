import type { FrameReport, Message } from './types'

export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

/** Envia a mensagem para todos os frames da aba e junta as respostas. */
export async function askAllFrames(tabId: number, message: Message): Promise<FrameReport[]> {
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? []
  const replies = await Promise.all(
    frames.map((f) =>
      chrome.tabs.sendMessage<Message, FrameReport>(tabId, message, { frameId: f.frameId }).catch(() => undefined),
    ),
  )
  return replies.filter((r): r is FrameReport => Boolean(r))
}
