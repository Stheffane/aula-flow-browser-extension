import { getItem, setRecord } from '../shared/storage'
import { summarize, SUMMARY_PROVIDERS } from '../shared/summary'
import { updateCourseDoc } from './courseDoc'

/** Gera o material de estudo de uma aula já transcrita e salva em `summaries`. */
export async function summarizeLesson(lessonUrl: string) {
  const [settings, transcripts] = await Promise.all([getItem('settings'), getItem('transcripts')])
  const transcript = transcripts[lessonUrl]
  if (!transcript) throw new Error('Esta aula ainda não foi transcrita.')

  const provider = settings.summaryProvider
  const apiKey = settings.apiKeys[provider]
  if (!apiKey) throw new Error(`Informe a chave do ${SUMMARY_PROVIDERS[provider].name} nas configurações.`)

  await setRecord('summaries', lessonUrl, { status: 'loading', createdAt: Date.now() })
  try {
    const context = await previousLessons(lessonUrl, transcript.course, transcript.createdAt)
    const markdown = await summarize(provider, transcript.title, transcript.text, apiKey, context)
    await setRecord('summaries', lessonUrl, {
      status: 'done',
      markdown,
      model: SUMMARY_PROVIDERS[provider].model,
      createdAt: Date.now(),
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await setRecord('summaries', lessonUrl, { status: 'error', error, createdAt: Date.now() })
    throw e
  }
}

/**
 * Resumo curto das aulas anteriores do mesmo curso (título + conceitos já explicados),
 * para a IA não repetir explicações de uma aula para outra.
 */
async function previousLessons(lessonUrl: string, course: string | undefined, before: number) {
  const [transcripts, summaries] = await Promise.all([getItem('transcripts'), getItem('summaries')])
  return Object.entries(transcripts)
    .filter(([url, t]) => url !== lessonUrl && t.course === course && t.createdAt < before)
    .sort(([, a], [, b]) => a.createdAt - b.createdAt)
    .slice(-15)
    .map(([url, t]) => {
      const md = summaries[url]?.markdown ?? ''
      const title = md.match(/^#\s+(.+)$/m)?.[1] ?? t.title
      const concepts = md
        .split(/^##\s+/m)
        .find((s) => s.startsWith('Conceitos principais'))
        ?.match(/^###\s+(.+)$/gm)
        ?.map((h) => h.replace(/^###\s+/, ''))
      return concepts?.length ? `- ${title}: ${concepts.join(', ')}` : `- ${title}`
    })
    .join('\n')
}

/** Gera o resumo assim que a transcrição termina, se houver chave configurada. */
export async function autoSummarize() {
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
