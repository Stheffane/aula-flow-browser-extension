import { useCallback, useEffect, useState } from 'react'
import { askAllFrames, getActiveTab, reinjectContentScripts } from '../shared/tabs'
import type { FrameReport, PageInfo } from '../shared/types'
import { lessonKey } from '../platforms/dom'

type State =
  | { status: 'loading' }
  | { status: 'unsupported' }
  | { status: 'ready'; info: PageInfo; frames: FrameReport[] }

/** Junta o que cada frame detectou: info do frame principal + vídeos de todos os frames. */
function merge(frames: FrameReport[]): PageInfo {
  const top = frames.find((f) => f.isTop) ?? frames[0]
  const videos = frames.flatMap((f) => f.info.videos)
  const info = { ...top.info, videos }
  if (videos.length && info.kind !== 'quiz') info.kind = 'lesson'
  // O vídeo pode estar num frame filho: recalcula a chave com todos os vídeos.
  if (!info.lessonKey.includes('#video-')) info.lessonKey = lessonKey(new URL(info.url), videos)
  return info
}

export function usePageInfo() {
  const [state, setState] = useState<State>({ status: 'loading' })

  const refresh = useCallback(async () => {
    const tab = await getActiveTab()
    if (!tab?.id) return setState({ status: 'unsupported' })
    let frames = await askAllFrames(tab.id, { type: 'GET_PAGE_INFO' })
    if (!frames.length) {
      // Pode ser só a extensão recém-atualizada: reinjeta os scripts e tenta de novo.
      await reinjectContentScripts(tab.id)
      frames = await askAllFrames(tab.id, { type: 'GET_PAGE_INFO' })
    }
    if (!frames.length) return setState({ status: 'unsupported' })
    const info = merge(frames)
    // Só atualiza se algo mudou (a verificação periódica não deve redesenhar o painel à toa).
    setState((prev) =>
      prev.status === 'ready' && JSON.stringify(prev.info) === JSON.stringify(info) ? prev : { status: 'ready', info, frames },
    )
  }, [])

  useEffect(() => {
    refresh()
    // Reavalia quando a aba carrega, muda de URL ou quando você troca de aba.
    const onUpdated = (_id: number, change: chrome.tabs.OnUpdatedInfo) => {
      if (change.status === 'complete' || change.url) refresh()
    }
    const onActivated = () => refresh()
    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs.onActivated.addListener(onActivated)
    // Em SPA a troca de aula não muda a URL nem dispara eventos: confere a página a cada 4 s.
    const timer = setInterval(refresh, 4000)
    return () => {
      clearInterval(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      chrome.tabs.onActivated.removeListener(onActivated)
    }
  }, [refresh])

  return { state, refresh }
}
