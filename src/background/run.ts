import { getItem, setItem, setRecord } from '../shared/storage'
import { isQuotaError } from '../shared/retry'
import { AI_HEARTBEAT } from '../shared/summary'
import type { FrameReport, Message, Run, RunItemInput } from '../shared/types'
import { failJob, finishJob, startJob } from './job'
import { updateCourseDoc } from './courseDoc'
import { summarizeModule } from './summarize'

/**
 * Processa um módulo (ou o curso inteiro), módulo a módulo:
 *   1. "transcribe": abre cada aula do módulo, grava e transcreve (só usa o Groq).
 *   2. "summarize": no fim do módulo, gera os materiais dele numa chamada de IA (economiza cota)
 *      e atualiza o documento da matéria. Depois segue para o próximo módulo.
 * O estado fica no storage ("run") e o avanço é guiado por eventos, então sobrevive
 * ao service worker ser reiniciado (o vigia retoma etapas perdidas).
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const WATCHDOG = 'run-watchdog'

async function save(run: Run) {
  // Fim do processamento: devolve o som da aba, se foi a extensão que silenciou.
  if (run.status !== 'running' && run.muted) {
    chrome.tabs.update(run.tabId, { muted: false }).catch(() => undefined)
    run = { ...run, muted: false }
  }
  await setItem('run', { ...run, updatedAt: Date.now() })
  // Enquanto houver processamento, o vigia confere o andamento a cada 30 s.
  if (run.status === 'running') chrome.alarms.create(WATCHDOG, { periodInMinutes: 0.5 })
  else chrome.alarms.clear(WATCHDOG)
}

async function sendToFrames<T>(tabId: number, msg: Message): Promise<T[]> {
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? []
  const replies = await Promise.all(
    frames.map((f) => chrome.tabs.sendMessage<Message, T>(tabId, msg, { frameId: f.frameId }).catch(() => undefined)),
  )
  return replies.filter((r): r is Awaited<T> => Boolean(r)) as T[]
}

export async function startRun(tabId: number, course: string | undefined, label: string, items: RunItemInput[]) {
  // Silencia só a saída de som da aba (se você ativou nas configurações); a gravação pega o áudio do vídeo.
  const { muteTabWhileProcessing: muted } = await getItem('settings')
  if (muted) await chrome.tabs.update(tabId, { muted: true }).catch(() => undefined)
  await save({
    tabId,
    course,
    label,
    items: items.map((i) => ({ ...i, status: 'pending' })),
    index: 0,
    status: 'running',
    phase: 'transcribe',
    muted,
  })
  await processCurrent()
}

export async function stopRun() {
  const run = await getItem('run')
  if (!run || run.status !== 'running') return
  await save({ ...run, status: 'stopped', summarizing: undefined })
  // Interrompe a gravação atual sem gerar material de uma aula pela metade.
  await failJob('Processamento interrompido.')
  await sendToFrames(run.tabId, { type: 'PLAYER_PAUSE' })
}

// ───────────────────────── Transcrever cada aula ─────────────────────────

let advancing = false

/** Marca a aula atual e passa para a próxima (com trava: o fluxo normal e o vigia podem chamar juntos). */
async function advance(status: 'skipped' | 'transcribed' | 'error', error?: string) {
  if (advancing) return
  advancing = true
  try {
    const run = await getItem('run')
    if (!run || run.status !== 'running' || run.phase !== 'transcribe' || run.items[run.index]?.status !== 'running') return
    run.items[run.index] = { ...run.items[run.index], status, error }
    run.index++
    // Limite diário do Groq: as próximas aulas falhariam igual. Pausa e explica.
    if (status === 'error' && error && isQuotaError(error)) {
      const paused = { ...run, status: 'error' as const, error: quotaMessage(error) }
      await save(paused)
      notifyEnd(paused)
      return
    }
    await save(run)
  } finally {
    advancing = false
  }
  await processCurrent()
}

/** Aulas do módulo já transcritas e ainda sem material. */
const pendingOf = (run: Run, module: string) => run.items.filter((i) => i.module === module && i.status === 'transcribed' && i.key)

async function processCurrent() {
  const run = await getItem('run')
  if (!run || run.status !== 'running' || run.phase !== 'transcribe') return
  const item = run.items[run.index]

  // Acabou um módulo (a próxima aula é de outro, ou não há próxima): gera o material dele antes de seguir.
  const prev = run.items[run.index - 1]
  if (prev && prev.module !== item?.module && pendingOf(run, prev.module).length) return summarizeStep(prev.module)
  if (!item) return finishRun()

  run.items[run.index] = { ...item, status: 'running' }
  await save(run)
  // Começa a aula sem resíduo da anterior: uma transcrição velha (ex.: "Interrompido" de ontem)
  // não pode ser confundida pelo vigia com o andamento desta aula.
  await setItem('job', null)

  try {
    // 1. Abre a aula na plataforma.
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
    await setRecord('lessonMeta', key, { module: item.module, order: item.order })
    const fresh = await getItem('run')
    if (fresh) await save({ ...fresh, items: fresh.items.map((i, n) => (n === fresh.index ? { ...i, key } : i)) })

    // 3. Já tem material: pula. Já transcrita: não reassiste (o material sai no fim do módulo).
    const [summaries, transcripts] = await Promise.all([getItem('summaries'), getItem('transcripts')])
    if (summaries[key]?.status === 'done') return advance('skipped')
    if (transcripts[key]?.text) return advance('transcribed')

    // 4. Grava e transcreve. O fim da aula chega pelo evento CAPTURE_FINISHED → onLessonFinished.
    const settings = await getItem('settings')
    const provider = settings.transcriptionProvider
    await startJob({ url: key, title: item.label, course: run.course, module: item.module }, { provider, apiKey: settings.apiKeys[provider] })

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

/** Chamado quando a transcrição da aula atual terminou (com ou sem erro). */
export async function onLessonFinished() {
  const [run, job] = await Promise.all([getItem('run'), getItem('job')])
  if (!run || run.status !== 'running' || run.phase !== 'transcribe' || run.items[run.index]?.status !== 'running') return
  // Só vale o resultado da transcrição desta aula (ignora eventos atrasados de outra).
  const key = run.items[run.index].key
  if (!job || !key || job.lesson.url !== key) return
  if (job.status === 'error') return advance('error', job.error)
  if (job.status === 'done') return advance('transcribed')
}

// ─────────────────── Material do módulo + documento ───────────────────

let summarizing = false

/** Gera os materiais das aulas transcritas de um módulo (uma chamada de IA), atualiza o documento e segue. */
async function summarizeStep(module: string) {
  if (summarizing) return
  summarizing = true
  try {
    let run = await getItem('run')
    if (!run || run.status !== 'running') return
    const pending = pendingOf(run, module)
    await save({ ...run, phase: 'summarize', summarizing: module })

    let error: string | undefined
    try {
      if (pending.length) await summarizeModule(pending.map((i) => i.key!))
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }

    // Atualiza o status de cada aula conforme o material salvo.
    const summaries = await getItem('summaries')
    run = (await getItem('run'))!
    if (run.status !== 'running') return
    run.items = run.items.map((i) => {
      if (!pending.some((p) => p.id === i.id)) return i
      const s = summaries[i.key!]
      if (s?.status === 'done') return { ...i, status: 'done', error: undefined }
      // Limite atingido em todos os provedores: a aula continua "transcrita" (material pendente).
      if (error && isQuotaError(error)) return i
      return { ...i, status: 'error', error: s?.error ?? error }
    })

    // O documento da matéria é atualizado ao fim de cada módulo (criado na primeira vez).
    await updateDoc(run)

    if (error && isQuotaError(error)) {
      const paused = { ...run, status: 'error' as const, phase: 'transcribe' as const, summarizing: undefined, error: quotaMessage(error) }
      await save(paused)
      notifyEnd(paused)
      return
    }
    await save({ ...run, phase: 'transcribe', summarizing: undefined })
  } finally {
    summarizing = false
  }
  await processCurrent() // próximo módulo (ou fim)
}

async function finishRun() {
  const run = await getItem('run')
  if (!run || run.status !== 'running') return
  const done = { ...run, status: 'done' as const, summarizing: undefined }
  await save(done)
  notifyEnd(done)
}

async function updateDoc(run: Run) {
  if (run.course) await updateCourseDoc(run.course).catch((e) => console.warn('Falha ao atualizar o documento', e))
}

// ───────────────────────────── Vigia ─────────────────────────────

const STALE_TRANSCRIBING = 90_000
const PLAYER_SILENT = 3 * 60_000
/** Sem sinal da chamada de IA há esse tempo: o service worker foi encerrado no meio. */
const STALE_SUMMARIZE = 2 * 60_000

/**
 * Vigia (a cada 30 s, via chrome.alarms): se o service worker foi encerrado no meio de uma etapa,
 * a continuação se perde. Aqui a etapa travada é identificada pelo estado salvo e retomada.
 */
export async function checkRun() {
  const run = await getItem('run')
  if (!run || run.status !== 'running') return

  // Material do módulo parado (service worker reiniciado no meio): gera de novo.
  if (run.phase === 'summarize') {
    if (summarizing) return
    const { [AI_HEARTBEAT]: beat = 0 } = (await chrome.storage.session.get(AI_HEARTBEAT)) as Record<string, number>
    const last = Math.max(beat, run.updatedAt ?? 0)
    if (Date.now() - last > STALE_SUMMARIZE) {
      const module = run.summarizing ?? run.items[run.index - 1]?.module
      if (module) summarizeStep(module)
    }
    return
  }

  const item = run.items[run.index]
  if (!item) return processCurrent()
  if (item.status !== 'running' || !item.key) return

  const job = await getItem('job')
  if (!job || job.lesson.url !== item.key) return
  const idle = Date.now() - (job.updatedAt ?? job.startedAt)

  if (job.status === 'error' || job.status === 'done') return onLessonFinished()

  if (job.status === 'recording') {
    // Player sem dar sinal há minutos: vídeo provavelmente terminou sem avisar. Encerra a gravação.
    const { lastPlayerStatus = 0 } = (await chrome.storage.session.get('lastPlayerStatus')) as { lastPlayerStatus?: number }
    if (Date.now() - lastPlayerStatus > PLAYER_SILENT && idle > PLAYER_SILENT) {
      await sendToFrames(run.tabId, { type: 'PLAYER_PAUSE' })
    }
    return
  }

  if (job.status === 'transcribing' && idle > STALE_TRANSCRIBING) await finishJob()
}

// ─────────────────────────── Avisos ───────────────────────────

function quotaMessage(error: string) {
  const who = /groq/i.test(error) && !/gemini/i.test(error) ? 'Groq (transcrição)' : 'serviço de IA'
  return `Limite de uso do ${who} atingido, então o processamento foi pausado. Nada se perde: o que já foi transcrito fica salvo. Quando o limite renovar (normalmente no dia seguinte), clique em processar de novo: aulas já transcritas não são reassistidas. Erro original: ${error}`
}

/** Notificação do sistema no fim do processamento (clicar abre o documento do curso). */
async function notifyEnd(run: Run) {
  const count = (s: Run['items'][number]['status']) => run.items.filter((i) => i.status === s).length
  const errors = count('error')
  const pending = count('transcribed')
  const parts = [
    `${count('done')} aula(s) com material`,
    pending && `${pending} transcrita(s) aguardando material`,
    count('skipped') && `${count('skipped')} já estava(m) pronta(s)`,
    errors && `${errors} com erro`,
  ]
  chrome.notifications.create('run-end', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: run.status === 'done' && !errors ? `${run.label} concluído` : `${run.label}: terminou com pendências`,
    message: parts.filter(Boolean).join(' · ') + '.',
  })
}

chrome.notifications.onClicked.addListener(async (id) => {
  if (id !== 'run-end') return
  const [run, docs] = await Promise.all([getItem('run'), getItem('courseDocs')])
  const doc = run?.course ? docs[run.course] : undefined
  if (doc) chrome.tabs.create({ url: doc.url })
  chrome.notifications.clear(id)
})
