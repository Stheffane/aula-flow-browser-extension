import { getItem } from '../shared/storage'
import { completeWithFallback } from '../shared/summary'
import { TUTOR_PROMPT, tutorUserPrompt } from '../shared/tutor'
import type { Question } from '../shared/types'

/** Quantas aulas mais relacionadas à pergunta vão junto como referência. */
const TOP_LESSONS = 4

const STOPWORDS = new Set(
  'a o e de da do das dos em no na nos nas um uma uns umas para por com sem que qual quais como mais menos ser são é foi pode podem sobre entre ao aos à às se seu sua seus suas isso esta este essa esse também quando onde ou não sim'.split(' '),
)
const words = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .match(/[a-z0-9]{4,}/g)
    ?.filter((w) => !STOPWORDS.has(w)) ?? []

/**
 * Material de referência enxuto: só as aulas mais relacionadas à pergunta (por palavras em comum)
 * vão completas; das outras vai apenas o título. Economiza bastante texto por pergunta.
 */
async function relevantMaterial(question: Question, course?: string) {
  const [transcripts, summaries, meta] = await Promise.all([getItem('transcripts'), getItem('summaries'), getItem('lessonMeta')])
  const terms = new Set(words(`${question.statement} ${question.options.join(' ')}`))

  const lessons = Object.entries(transcripts)
    .filter(([url, t]) => (!course || t.course === course) && summaries[url]?.status === 'done')
    .map(([url]) => {
      const md = summaries[url].markdown ?? ''
      const title = `${meta[url]?.module ? `[${meta[url]?.module}] ` : ''}${md.match(/^#\s+(.+)$/m)?.[1] ?? transcripts[url].title}`
      const score = words(md).filter((w) => terms.has(w)).length
      return { title, md, score }
    })
    .sort((a, b) => b.score - a.score)

  const top = lessons.slice(0, TOP_LESSONS).filter((l) => l.score > 0)
  const others = lessons.filter((l) => !top.includes(l)).map((l) => `- ${l.title}`)
  return [
    top.map((l) => `${l.title}\n${l.md}`).join('\n\n---\n\n'),
    others.length && `Outras aulas do curso (só os títulos):\n${others.join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function explainQuestion(question: Question, course?: string) {
  const settings = await getItem('settings')
  const material = await relevantMaterial(question, course)
  const { text } = await completeWithFallback(TUTOR_PROMPT, tutorUserPrompt(question, material), {
    primary: settings.summaryProvider,
    apiKeys: settings.apiKeys,
  })
  return text
}
