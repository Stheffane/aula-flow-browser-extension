import { getItem, setItem, setRecord } from '../shared/storage'
import type { FrameReport, Message, OutlineModule, Run } from '../shared/types'
import { failJob, finishJob, startJob } from './job'
import { updateCourseDoc } from './courseDoc'
import { autoSummarize } from './summarize'

/**
 * Processa um módulo inteiro: abre cada aula pelo menu, grava/transcreve, resume e segue para a próxima.
 * O estado fica no storage ("run") e o avanço é guiado por eventos (fim da transcrição),
 * então funciona mesmo que o service worker seja reiniciado entre uma aula e outra.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function save(run: Run) {
  await setItem('run', run)
  // Enquanto houver módulo em processamento, o vigia confere o andamento a cada 30 s.
  if (run.status === 'running') chrome.alarms.create(WATCHDOG, { periodInMinutes: 0.5 })
  else chrome.alarms.clear(WATCHDOG)
}

export const WATCHDOG = 'run-watchdog'

async function sendToFrames<T>(tabId: number, msg: Message): Promise<T[]> {
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? []
  const replies = await Promise.all(
    frames.map((f) => chrome.tabs.sendMessage<Message, T>(tabId, msg, { frameId: f.frameId }).catch(() => undefined)),
  )
  return replies.filter((r): r is Awaited<T> => Boolean(r)) as T[]
}

/** Posição da aula no módulo (guardada no run como "order" de cada item). */
const orderOf = (run: Run, id: string) => run.items.find((i) => i.id === id)?.order ?? run.index

export async function startRun(tabId: number, course: string | undefined, module: OutlineModule, startId: string) {
  const start = Math.max(0, module.items.findIndex((i) => i.id === startId))
  await save({
    tabId,
    course,
    module: module.name,
    items: module.items.map((i, order) => ({ ...i, order, status: 'pending' as const })).slice(start),
    index: 0,
    status: 'running',
  })
  await processCurrent()
}

export async function stopRun() {
  const run = await getItem('run')
  if (!run || run.status !== 'running') return
  await save({ ...run, status: 'stopped' })
  // Interrompe a gravação atual sem gerar resumo de uma aula pela metade.
  await failJob('Processamento do módulo interrompido.')
  await sendToFrames(run.tabId, { type: 'PLAYER_PAUSE' })
}

let advancing = false

/** Marca a aula atual e passa para a próxima (com trava: o fluxo normal e o vigia podem chamar juntos). */
async function advance(status: 'done' | 'skipped' | 'error', error?: string) {
  if (advancing) return
  advancing = true
  try {
    const run = await getItem('run')
    if (!run || run.status !== 'running' || run.items[run.index]?.status !== 'running') return
    run.items[run.index] = { ...run.items[run.index], status, error }
    run.index++
    await save(run)
  } finally {
    advancing = false
  }
  await processCurrent()
}

async function processCurrent() {
  const run = await getItem('run')
  if (!run || run.status !== 'running') return
  const item = run.items[run.index]

  if (!item) {
    await save({ ...run, status: 'done' })
    if (run.course) await updateCourseDoc(run.course).catch(() => undefined)
    return
  }

  run.items[run.index] = { ...item, status: 'running' }
  await save(run)

  try {
    // 1. Abre a aula no menu da plataforma.
    const opened = await chrome.tabs.sendMessage<Message, { ok: boolean; error?: string }>(
      run.tabId,
      { type: 'OPEN_LESSON', id: item.id },
      { frameId: 0 },
    )
    if (!opened?.ok) throw new Error(opened?.error ?? 'A página da aula não respondeu.')
    await sleep(1500)

    // 2. Identifica a aula aberta (a chave vem do ID do vídeo).
    const top = await chrome.tabs.sendMessage<Message, FrameReport>(run.tabId, { type: 'GET_PAGE_INFO' }, { frameId: 0 })
    const key = top?.info.lessonKey
    if (!key || !key.includes('#video-')) throw new Error('A aula abriu, mas o vídeo não foi encontrado.')

    // 3. Aula já processada antes: pula.
    const summaries = await getItem('summaries')
    if (summaries[key]?.status === 'done') return advance('skipped')
    const fresh = await getItem('run')
    if (fresh) await save({ ...fresh, items: fresh.items.map((i, n) => (n === fresh.index ? { ...i, key } : i)) })

    // 4. Grava e transcreve. O resto (resumo, documento, próxima aula) segue pelos eventos.
    const settings = await getItem('settings')
    const provider = settings.transcriptionProvider
    await setRecord('lessonMeta', key, { module: run.module, order: orderOf(run, item.id) })
    await startJob({ url: key, title: item.label, course: run.course, module: run.module }, { provider, apiKey: settings.apiKeys[provider] })

    // O script do player do vídeo novo pode demorar a carregar: tenta por até ~20 s.
    for (let attempt = 0; attempt < 15; attempt++) {
      const replies = await sendToFrames<{ ok: boolean; needsClick?: boolean; error?: string }>(run.tabId, {
        type: 'PLAYER_RECORD',
        rate: settings.playbackRate,
      })
      if (replies.some((r) => r.ok)) return
      const error = replies.find((r) => r.error)?.error
      if (error) throw new Error(error)
      await sleep(1500)
    }
    throw new Error('O player do vídeo não respondeu.')
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await failJob(error)
    await advance('error', error)
  }
}

/** Chamado quando a aula atual terminou (transcrição + resumo + documento), com ou sem erro. */
export async function onLessonFinished() {
  const [run, job] = await Promise.all([getItem('run'), getItem('job')])
  if (!run || run.status !== 'running' || run.items[run.index]?.status !== 'running') return
  if (job?.status === 'error') return advance('error', job.error)
  const summary = job ? (await getItem('summaries'))[job.lesson.url] : undefined
  if (summary?.status === 'error') return advance('error', summary.error)
  await advance('done')
}

const STALE_TRANSCRIBING = 90_000
const STALE_SUMMARY = 4 * 60_000
const PLAYER_SILENT = 3 * 60_000

/**
 * Vigia (a cada 30 s, via chrome.alarms): se o service worker foi encerrado no meio de uma etapa,
 * a continuação se perde. Aqui a etapa travada é identificada pelo estado salvo e retomada.
 */
export async function checkRun() {
  const run = await getItem('run')
  const item = run?.items[run.index]
  if (!run || run.status !== 'running' || item?.status !== 'running' || !item.key) return

  const [job, summaries] = await Promise.all([getItem('job'), getItem('summaries')])
  if (!job || job.lesson.url !== item.key) return
  const idle = Date.now() - (job.updatedAt ?? job.startedAt)

  if (job.status === 'error') return onLessonFinished()

  if (job.status === 'recording') {
    // Player sem dar sinal há minutos: vídeo provavelmente terminou sem avisar. Encerra a gravação.
    const { lastPlayerStatus = 0 } = (await chrome.storage.session.get('lastPlayerStatus')) as { lastPlayerStatus?: number }
    if (Date.now() - lastPlayerStatus > PLAYER_SILENT && idle > PLAYER_SILENT) {
      await sendToFrames(run.tabId, { type: 'PLAYER_PAUSE' })
    }
    return
  }

  if (job.status === 'transcribing' && idle > STALE_TRANSCRIBING) {
    await finishJob()
    return
  }

  if (job.status === 'done') {
    const summary = summaries[item.key]
    const stuck = summary?.status === 'loading' && Date.now() - summary.createdAt > STALE_SUMMARY
    if (!summary || stuck) {
      await autoSummarize()
      return onLessonFinished()
    }
    if (summary.status !== 'loading') return onLessonFinished()
  }
}
