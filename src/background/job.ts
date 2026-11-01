import { getItem, setItem } from '../shared/storage'
import { transcribe, type Transcriber } from '../shared/transcription'
import type { Job, JobStatus, LessonRef } from '../shared/types'

/**
 * Transcrição em andamento. O estado fica no chrome.storage (e não só em memória)
 * porque o service worker pode ser encerrado entre um trecho e outro.
 */
let queue: Promise<void> = Promise.resolve()

const BADGE: Record<JobStatus, { text: string; color: string }> = {
  recording: { text: 'REC', color: '#d93025' },
  transcribing: { text: '...', color: '#b7791f' },
  done: { text: 'OK', color: '#1f8a4c' },
  error: { text: '!', color: '#d93025' },
}

async function save(job: Job) {
  await setItem('job', job)
  // Indicador no ícone, visível mesmo com o painel fechado. "OK" e "!" somem depois de um tempo.
  chrome.action.setBadgeText({ text: BADGE[job.status].text })
  chrome.action.setBadgeBackgroundColor({ color: BADGE[job.status].color })
  if (job.status === 'done' || job.status === 'error') setTimeout(() => chrome.action.setBadgeText({ text: '' }), 15_000)
}

/** Executa em fila, um passo de cada vez, para os trechos não se atropelarem. */
function enqueue(step: (job: Job) => Promise<Job | void>) {
  queue = queue.then(async () => {
    const job = await getItem('job')
    if (!job || job.status === 'error' || job.status === 'done') return
    try {
      const next = await step(job)
      if (!next) return
      // Se o status mudou para "transcrevendo" durante o passo, mantém essa mudança.
      const latest = await getItem('job')
      if (next.status === 'recording' && latest?.status === 'transcribing') next.status = 'transcribing'
      await save(next)
    } catch (e) {
      await save({ ...job, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  })
  return queue
}

export async function startJob(lesson: LessonRef, transcriber: Transcriber) {
  await queue
  await chrome.storage.session.set({ transcriber })
  await save({ lesson, status: 'recording', segmentsDone: 0, startedAt: Date.now(), preview: '' })
}

export function addSegment(dataUrl: string) {
  return enqueue(async (job) => {
    const audio = await (await fetch(dataUrl)).blob()
    if (audio.size < 2_000) return // trecho vazio
    const { transcriber } = (await chrome.storage.session.get('transcriber')) as { transcriber: Transcriber }
    const text = await transcribe(audio, transcriber, job.lesson.title)
    return { ...job, segmentsDone: job.segmentsDone + 1, preview: [job.preview, text].filter(Boolean).join('\n\n') }
  })
}

export function finishJob() {
  return enqueue(async (job) => {
    if (!job.preview) throw new Error('Nenhum áudio foi capturado.')
    const transcripts = await getItem('transcripts')
    await setItem('transcripts', {
      ...transcripts,
      [job.lesson.url]: { title: job.lesson.title, text: job.preview, createdAt: Date.now() },
    })
    return { ...job, status: 'done' }
  })
}

export function failJob(error: string) {
  return enqueue(async (job) => ({ ...job, status: 'error', error }))
}

/** Mostra "transcrevendo" enquanto os últimos trechos terminam. */
export async function markTranscribing() {
  const job = await getItem('job')
  if (job?.status === 'recording') await save({ ...job, status: 'transcribing' })
}
