import { setItem } from '../shared/storage'
import type { Message } from '../shared/types'
import { addSegment, failJob, finishJob, markTranscribing, startJob } from './job'
import { summarizeLesson } from './summarize'
import { updateCourseDoc } from './courseDoc'
import { getItem } from '../shared/storage'

// Abre o painel lateral ao clicar no ícone da extensão.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error)

/**
 * Quando o navegador abre ou a extensão é recarregada/atualizada, o que estava em andamento
 * foi interrompido: marca como erro para os botões voltarem (em vez de ficar "gerando" para sempre).
 */
async function clearInterrupted() {
  const [job, summaries] = await Promise.all([getItem('job'), getItem('summaries')])
  if (job && (job.status === 'recording' || job.status === 'transcribing')) {
    await setItem('job', { ...job, status: 'error', error: 'Interrompido: a extensão foi recarregada. Transcreva de novo.' })
  }
  const fixed = Object.fromEntries(
    Object.entries(summaries).map(([url, s]) => [
      url,
      s.status === 'loading' ? { ...s, status: 'error' as const, error: 'Interrompido: a extensão foi recarregada. Gere de novo.' } : s,
    ]),
  )
  await setItem('summaries', fixed)
}
chrome.runtime.onStartup.addListener(clearInterrupted)
chrome.runtime.onInstalled.addListener(clearInterrupted)

const OFFSCREEN_URL = 'src/offscreen/index.html'

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })
  if (contexts.length) return
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Gravar o áudio da aula para transcrição',
  })
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  const reply = (p: Promise<unknown>) => {
    p.then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: String(e) }))
    return true // resposta assíncrona
  }

  switch (msg.type) {
    case 'JOB_START':
      return reply(startJob(msg.lesson, msg.transcriber))
    case 'CAPTURE_REQUEST':
      return reply(ensureOffscreen().then(() => chrome.runtime.sendMessage({ type: 'OFFSCREEN_START', streamId: msg.streamId })))
    case 'AUDIO_SEGMENT':
      addSegment(msg.dataUrl)
      break
    case 'CAPTURE_FINISHED':
      markTranscribing()
        .then(finishJob)
        .then(autoSummarize)
      break
    case 'SUMMARIZE':
      return reply(
        summarizeLesson(msg.lessonUrl).then(async () => {
          const transcripts = await getItem('transcripts')
          await autoUpdateCourseDoc(transcripts[msg.lessonUrl]?.course)
        }),
      )
    case 'UPDATE_COURSE_DOC':
      return reply(updateCourseDoc(msg.course))
    case 'CAPTURE_FAILED':
      failJob(msg.error)
      break
  }
})

/** Gera o resumo assim que a transcrição termina, se houver chave configurada. */
async function autoSummarize() {
  const [job, settings] = await Promise.all([getItem('job'), getItem('settings')])
  if (job?.status !== 'done' || !settings.apiKeys[settings.summaryProvider]) return
  await summarizeLesson(job.lesson.url).catch(() => undefined) // o erro já fica salvo no resumo
  await autoUpdateCourseDoc(job.lesson.course)
}

/**
 * Se o documento do curso já existe, atualiza com a aula nova.
 * (A primeira criação é pelo botão no painel, porque pode precisar do login do Google.)
 */
export async function autoUpdateCourseDoc(course = 'Sem curso') {
  const docs = await getItem('courseDocs')
  if (docs[course]) await updateCourseDoc(course).catch((e) => console.warn('Falha ao atualizar o doc do curso', e))
}
