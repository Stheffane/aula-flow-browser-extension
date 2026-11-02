import { getItem, setRecord } from '../shared/storage'
import { summarize, summarizeBatch, SUMMARY_PROVIDERS } from '../shared/summary'
import { updateCourseDoc } from './courseDoc'

/** Gera o material de estudo de uma aula já transcrita e salva em `summaries` (com reserva entre provedores). */
export async function summarizeLesson(lessonUrl: string) {
  const [settings, transcripts] = await Promise.all([getItem('settings'), getItem('transcripts')])
  const transcript = transcripts[lessonUrl]
  if (!transcript) throw new Error('Esta aula ainda não foi transcrita.')
  const opts = { primary: settings.summaryProvider, apiKeys: settings.apiKeys }

  await setRecord('summaries', lessonUrl, { status: 'loading', createdAt: Date.now() })
  try {
    const context = await previousLessons(lessonUrl, transcript.course, transcript.createdAt)
    const { text, model } = await summarize(transcript.title, transcript.text, opts, context)
    await setRecord('summaries', lessonUrl, { status: 'done', markdown: text, model, createdAt: Date.now() })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await setRecord('summaries', lessonUrl, { status: 'error', error, createdAt: Date.now() })
    throw e
  }
}

/**
 * Tamanho máximo de transcrição por chamada no material por módulo (módulos maiores são divididos).
 * Lotes menores respondem mais rápido e, se falharem, perdem menos (~2 aulas longas por chamada).
 */
const BATCH_CHARS = 60_000

/**
 * Gera o material de várias aulas do mesmo módulo com o mínimo de chamadas à IA.
 * Aulas que a IA pular na resposta são refeitas uma a uma.
 */
export async function summarizeModule(keys: string[]) {
  const [settings, transcripts] = await Promise.all([getItem('settings'), getItem('transcripts')])
  const opts = { primary: settings.summaryProvider, apiKeys: settings.apiKeys }
  const lessons = keys.filter((k) => transcripts[k]?.text)
  if (!lessons.length) return

  // Divide em lotes pelo tamanho do texto.
  const batches: string[][] = [[]]
  let size = 0
  for (const key of lessons) {
    const len = transcripts[key].text.length
    if (size + len > BATCH_CHARS && batches[batches.length - 1].length) {
      batches.push([])
      size = 0
    }
    batches[batches.length - 1].push(key)
    size += len
  }

  for (const batch of batches) {
    for (const key of batch) await setRecord('summaries', key, { status: 'loading', createdAt: Date.now() })
    const first = transcripts[batch[0]]
    const context = await previousLessons(batch[0], first.course, first.createdAt, batch)
    try {
      const { markdowns, model } = await summarizeBatch(
        batch.map((k) => ({ title: transcripts[k].title, transcript: transcripts[k].text })),
        opts,
        context,
      )
      for (const [i, key] of batch.entries()) {
        const markdown = markdowns[i]
        if (markdown) await setRecord('summaries', key, { status: 'done', markdown, model, createdAt: Date.now() })
        else await summarizeLesson(key).catch(() => undefined) // a IA pulou esta: refaz sozinha
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      for (const key of batch) await setRecord('summaries', key, { status: 'error', error, createdAt: Date.now() })
      throw e
    }
  }
}

/** Posição da aula no curso (módulo + ordem no menu), para saber o que veio antes. */
const position = (meta: { module?: string; order?: number } | undefined, createdAt: number) =>
  meta?.module ? `${meta.module}|${String(meta.order ?? 999).padStart(3, '0')}` : `~${createdAt}`

/**
 * Resumo curto das aulas anteriores do mesmo curso (título + conceitos já explicados),
 * para a IA não repetir explicações de uma aula para outra.
 */
async function previousLessons(lessonUrl: string, course: string | undefined, createdAt: number, exclude: string[] = []) {
  const [transcripts, summaries, meta] = await Promise.all([getItem('transcripts'), getItem('summaries'), getItem('lessonMeta')])
  const here = position(meta[lessonUrl], createdAt)
  const cmp = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true })
  return Object.entries(transcripts)
    .filter(([url, t]) => url !== lessonUrl && !exclude.includes(url) && t.course === course && summaries[url]?.status === 'done')
    .filter(([url, t]) => cmp(position(meta[url], t.createdAt), here) < 0)
    .sort(([ua, a], [ub, b]) => cmp(position(meta[ua], a.createdAt), position(meta[ub], b.createdAt)))
    .slice(-20)
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
  if (job?.status !== 'done' || !settings.apiKeys[SUMMARY_PROVIDERS[settings.summaryProvider].key]) return
  // Processando módulo/curso: o material sai depois, por módulo (fase 2), e não aula a aula.
  const run = await getItem('run')
  if (run?.status === 'running') return
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
