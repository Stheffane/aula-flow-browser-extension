import { useState } from 'react'
import { usePageInfo } from './usePageInfo'
import { askAllFrames, getActiveTab } from '../shared/tabs'
import type { PageKind } from '../shared/types'

const KIND_LABEL: Record<PageKind, string> = {
  lesson: 'Aula com vídeo',
  quiz: 'Questionário',
  course: 'Página da disciplina',
  unknown: 'Nenhuma aula detectada',
}

export function App() {
  const { state, refresh } = usePageInfo()
  const [copied, setCopied] = useState(false)

  // Copia um resumo da estrutura da página para ajustarmos o adaptador da plataforma.
  async function inspect() {
    const tab = await getActiveTab()
    if (!tab?.id) return
    const frames = await askAllFrames(tab.id, { type: 'GET_SNAPSHOT' })
    await navigator.clipboard.writeText(JSON.stringify(frames, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main>
      <header>
        <h1>Aula Flow</h1>
        <button className="ghost" onClick={refresh}>Atualizar</button>
      </header>

      {state.status === 'loading' && <p className="muted">Analisando a página…</p>}

      {state.status === 'unsupported' && (
        <section className="card">
          <p>Esta página não é de uma plataforma suportada.</p>
          <p className="muted">Abra uma disciplina na plataforma de estudo.</p>
        </section>
      )}

      {state.status === 'ready' && (
        <>
          <section className="card">
            <span className={`badge ${state.info.kind}`}>{KIND_LABEL[state.info.kind]}</span>
            <h2>{state.info.title}</h2>
            <dl>
              <dt>Plataforma</dt>
              <dd>{state.info.platform}</dd>
              {state.info.courseId && (
                <>
                  <dt>Disciplina</dt>
                  <dd>{state.info.courseId}</dd>
                </>
              )}
              <dt>Vídeos</dt>
              <dd>{state.info.videos.length}</dd>
            </dl>
            {state.info.videos.map((v) => (
              <p key={v.src} className="video">
                <strong>{v.type}</strong> {v.src}
                {v.duration ? ` · ${Math.round(v.duration / 60)} min` : ''}
              </p>
            ))}
          </section>

          <button onClick={inspect}>{copied ? 'Copiado!' : 'Inspecionar página (copiar estrutura)'}</button>
        </>
      )}
    </main>
  )
}
