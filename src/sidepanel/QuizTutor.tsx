import { useState } from 'react'
import Markdown from 'react-markdown'
import type { Message, PageInfo } from '../shared/types'

/** Explicações já geradas nesta sessão do painel (por enunciado), para não gastar a IA de novo. */
const cache = new Map<string, string>()

/**
 * Tutor de questionários: lê a pergunta da tela e explica o que está sendo pedido,
 * os conceitos e onde revisar no curso. Não indica a alternativa correta.
 */
export function QuizTutor({ info }: { info: PageInfo }) {
  const question = info.question
  const key = question ? question.statement + question.options.join('|') : ''
  const [state, setState] = useState<{ key: string; status: 'loading' | 'error'; error?: string } | null>(null)
  const explanation = cache.get(key)

  async function explain() {
    if (!question) return
    setState({ key, status: 'loading' })
    const res = await chrome.runtime.sendMessage<Message, { ok: boolean; markdown?: string; error?: string }>({
      type: 'EXPLAIN_QUESTION',
      course: info.course,
      question,
    })
    if (res?.ok && res.markdown) {
      cache.set(key, res.markdown)
      setState(null)
    } else setState({ key, status: 'error', error: res?.error ?? 'Falha ao gerar a explicação.' })
  }

  const loading = state?.key === key && state.status === 'loading'

  return (
    <section className="card stack">
      <h3>Tutor da questão</h3>

      {!question && (
        <p className="small muted">
          Abra uma questão da avaliação. O tutor lê a pergunta da tela e explica o que está sendo pedido, sem dar a
          resposta.
        </p>
      )}

      {question && (
        <>
          <div className="question">
            <p>{question.statement || <em className="muted">(enunciado não identificado)</em>}</p>
            <ol type="A">
              {question.options.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ol>
          </div>

          {explanation ? (
            <article className="markdown">
              <Markdown>{explanation}</Markdown>
            </article>
          ) : (
            <button onClick={explain} disabled={loading}>
              {loading ? 'Pensando na explicação…' : 'Explicar esta questão'}
            </button>
          )}
          {state?.key === key && state.status === 'error' && <p className="error small">{state.error}</p>}
          <p className="small muted">
            O tutor explica a pergunta e os conceitos e aponta onde revisar no curso. A escolha da resposta é sua.
          </p>
        </>
      )}
    </section>
  )
}
