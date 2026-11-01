import type { FrameReport, Message } from './types'

export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

/** Envia a mensagem para todos os frames da aba e junta as respostas (frames sem resposta são ignorados). */
export async function askAllFrames<T = FrameReport>(tabId: number, message: Message): Promise<T[]> {
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? []
  const replies = await Promise.all(
    frames.map((f) => chrome.tabs.sendMessage<Message, T>(tabId, message, { frameId: f.frameId }).catch(() => undefined)),
  )
  return replies.filter((r): r is Awaited<T> => Boolean(r)) as T[]
}

/** Converte um match pattern do manifest (ex.: https://*.site.com/*) em RegExp. */
function patternToRegex(pattern: string) {
  const [, scheme, host, path] = pattern.match(/^(\*|https?):\/\/([^/]+)(\/.*)$/) ?? []
  if (!scheme) return null
  const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  const hostRe = host === '*' ? '[^/]+' : host.startsWith('*.') ? `([^/]+\\.)?${esc(host.slice(2))}` : esc(host)
  const schemeRe = scheme === '*' ? 'https?' : scheme
  return new RegExp(`^${schemeRe}://${hostRe}${esc(path).replace(/\*/g, '.*')}$`)
}

/**
 * Quando a extensão é recarregada, os scripts antigos das abas abertas param de responder.
 * Aqui reinjetamos os content scripts do manifest nos frames correspondentes, sem precisar dar F5.
 */
export async function reinjectContentScripts(tabId: number) {
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? []
  for (const cs of chrome.runtime.getManifest().content_scripts ?? []) {
    const regexes = (cs.matches ?? []).map(patternToRegex).filter((r): r is RegExp => !!r)
    const frameIds = frames.filter((f) => regexes.some((r) => r.test(f.url))).map((f) => f.frameId)
    if (!frameIds.length || !cs.js?.length) continue
    await chrome.scripting.executeScript({ target: { tabId, frameIds }, files: cs.js }).catch(() => undefined)
  }
}
