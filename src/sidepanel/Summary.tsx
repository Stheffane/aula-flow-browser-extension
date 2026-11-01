import { useState } from 'react'
import Markdown from 'react-markdown'
import { useStorage } from './useStorage'
import { SUMMARY_PROVIDERS } from '../shared/summary'
import { currentAccount, signIn } from '../shared/google'
import type { LessonRef, Message } from '../shared/types'

/** Material de estudo gerado pela IA a partir da transcrição. */
export function Summary({ lesson }: { lesson: LessonRef }) {
  const [settings] = useStorage('settings')
  const [transcripts] = useStorage('transcripts')
  const [summaries] = useStorage('summaries')
  const [copied, setCopied] = useState(false)
  const [courseDocs] = useStorage('courseDocs')
  const [doc, setDoc] = useState<{ status: 'idle' | 'loading' | 'error'; error?: string }>({ status: 'idle' })
  const course = lesson.course || 'Sem curso'
  const courseDoc = courseDocs[course]

  const transcript = transcripts[lesson.url]
  const summary = summaries[lesson.url]
  const provider = SUMMARY_PROVIDERS[settings.summaryProvider]
  const hasKey = !!settings.apiKeys[settings.summaryProvider]

  if (!transcript) return null

  function generate() {
    // O background salva o resultado (ou o erro) em `summaries`; o painel só observa.
    chrome.runtime.sendMessage({ type: 'SUMMARIZE', lessonUrl: lesson.url } satisfies Message)
  }

  async function updateDoc() {
    if (courseDoc && !confirm('O documento do curso será regerado com todas as aulas. Edições feitas direto no Google Docs serão substituídas. Continuar?')) return
    setDoc({ status: 'loading' })
    // O login precisa abrir pelo painel (aba do Google); o background só usa o acesso salvo.
    if (!(await currentAccount())) {
      try {
        await signIn(true)
      } catch (e) {
        return setDoc({ status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }
    const res = await chrome.runtime.sendMessage<Message, { ok: boolean; error?: string }>({
      type: 'UPDATE_COURSE_DOC',
      course,
    })
    setDoc(res?.ok ? { status: 'idle' } : { status: 'error', error: res?.error ?? 'Falha ao gerar o documento.' })
  }

  async function copy() {
    await navigator.clipboard.writeText(summary?.markdown ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Segurança extra: "gerando" há mais de 4 min é considerado travado e libera o botão.
  const stuck = summary?.status === 'loading' && Date.now() - summary.createdAt > 4 * 60_000
  const loading = summary?.status === 'loading' && !stuck

  return (
    <section className="card stack">
      <div className="row">
        <h3>Material de estudo</h3>
        {summary?.status === 'done' && (
          <button className="ghost" onClick={copy}>
            {copied ? 'Copiado!' : 'Copiar Markdown'}
          </button>
        )}
      </div>

      {!hasKey && <p className="muted">Informe a chave do {provider.name} nas configurações para gerar o resumo.</p>}
      {loading && <p>Gerando o material com {provider.name}… isso leva uns segundos.</p>}
      {summary?.status === 'error' && <p className="error">Erro: {summary.error}</p>}
      {stuck && <p className="error">A geração anterior não terminou. Gere de novo.</p>}

      {summary?.status === 'done' && summary.markdown && (
        <article className="markdown">
          <Markdown>{summary.markdown}</Markdown>
        </article>
      )}

      {summary?.status === 'done' && (
        <div className="docs">
          <strong className="small">Documento do curso</strong>
          {courseDoc ? (
            <>
              <a className="doc-link" href={courseDoc.url} target="_blank" rel="noreferrer">
                📄 Abrir no Google Docs
              </a>
              <p className="small muted">
                Atualizado em {new Date(courseDoc.updatedAt).toLocaleString('pt-BR')}. Cada aula nova entra automaticamente.
              </p>
            </>
          ) : (
            <p className="small muted">Um único Google Docs com todas as aulas de “{course}”, organizado por módulo.</p>
          )}
          <button className={courseDoc ? 'ghost' : ''} onClick={updateDoc} disabled={doc.status === 'loading'}>
            {doc.status === 'loading' ? 'Gerando documento…' : courseDoc ? 'Atualizar agora' : 'Criar documento do curso'}
          </button>
          {doc.status === 'error' && <p className="error small">{doc.error}</p>}
        </div>
      )}

      {!loading && (
        <button className={summary?.status === 'done' ? 'secondary' : ''} onClick={generate} disabled={!hasKey}>
          {summary?.status === 'done' ? 'Gerar de novo' : 'Gerar material de estudo'}
        </button>
      )}
    </section>
  )
}
