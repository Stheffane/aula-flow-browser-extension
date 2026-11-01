import { getItem, setRecord } from '../shared/storage'
import { summarize, SUMMARY_PROVIDERS } from '../shared/summary'

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
    const markdown = await summarize(provider, transcript.title, transcript.text, apiKey)
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
