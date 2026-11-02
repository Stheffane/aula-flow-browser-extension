import { setItem } from '../shared/storage'
import type { Message } from '../shared/types'
import { addSegment, failJob, finishJob, markTranscribing, startJob } from './job'
import { autoSummarize, autoUpdateCourseDoc, summarizeLesson } from './summarize'
import { updateCourseDoc } from './courseDoc'
import { explainQuestion } from './tutor'
import { checkRun, onLessonFinished, startRun, stopRun, WATCHDOG } from './run'
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
  const run = await getItem('run')
  if (run?.status === 'running') await setItem('run', { ...run, status: 'error', error: 'Interrompido: a extensão foi recarregada. Processe de novo (as aulas prontas são puladas).' })
}
chrome.runtime.onStartup.addListener(clearInterrupted)
chrome.runtime.onInstalled.addListener(clearInterrupted)
chrome.runtime.onInstalled.addListener(removeOldPlatosKeys)

/**
 * Até a etapa 4, as aulas da Platos eram salvas pela URL, que é igual para todas as aulas
 * (uma sobrescrevia a outra). Agora a chave inclui o ID do vídeo: remove os registros antigos.
 */
async function removeOldPlatosKeys() {
  const isOld = (key: string) => key.includes('platosedu.io') && !key.includes('#video-')
  for (const name of ['transcripts', 'summaries', 'lessonMeta'] as const) {
    const all = await getItem(name)
    if (Object.keys(all).some(isOld)) await setItem(name, Object.fromEntries(Object.entries(all).filter(([k]) => !isOld(k))))
  }
}

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
        .finally(onLessonFinished) // se estiver processando um módulo, segue para a próxima aula
      break
    case 'RUN_START':
      return reply(startRun(msg.tabId, msg.course, msg.label, msg.items))
    case 'RUN_STOP':
      return reply(stopRun())
    case 'EXPLAIN_QUESTION':
      explainQuestion(msg.question, msg.course)
        .then((markdown) => sendResponse({ ok: true, markdown }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }))
      return true
    case 'SUMMARIZE':
      return reply(
        summarizeLesson(msg.lessonUrl).then(async () => {
          const transcripts = await getItem('transcripts')
          await autoUpdateCourseDoc(transcripts[msg.lessonUrl]?.course)
        }),
      )
    case 'UPDATE_COURSE_DOC':
      return reply(updateCourseDoc(msg.course))
    case 'PLAYER_STATUS':
      // Guarda o último sinal do player: o vigia usa para perceber vídeo parado.
      chrome.storage.session.set({ lastPlayerStatus: Date.now() })
      break
    case 'CAPTURE_FAILED':
      failJob(msg.error).finally(onLessonFinished)
      break
  }
})

// Vigia do processamento de módulo: retoma passos perdidos se o service worker foi reiniciado.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCHDOG) checkRun()
})
