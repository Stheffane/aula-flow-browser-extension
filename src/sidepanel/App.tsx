import { useState } from 'react'
import { usePageInfo } from './usePageInfo'
import { askAllFrames, getActiveTab } from '../shared/tabs'
import type { PageKind } from '../shared/types'
import { Settings } from './Settings'
import { Transcription } from './Transcription'
import { Summary } from './Summary'
import { ModulePicker } from './ModulePicker'

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
          <p>Não reconheci esta página.</p>
          <p className="muted">
            Abra uma aula na plataforma de estudo. Se ela já estiver aberta, recarregue a página (F5) e clique em
            Atualizar.
          </p>
        </section>
      )}

      {state.status === 'ready' && (
        <>
          <section className="card">
            <span className={`badge ${state.info.kind}`}>{KIND_LABEL[state.info.kind]}</span>
            <h2>{state.info.title}</h2>
            <dl>
              {state.info.course && (
                <>
                  <dt>Curso</dt>
                  <dd>{state.info.course}</dd>
                </>
              )}
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
            {state.info.kind === 'lesson' && (
              <ModulePicker lessonUrl={state.info.url} modules={state.info.modules ?? []} />
            )}
            {state.info.videos.map((v) => (
              <p key={v.src} className="video">
                <strong>{v.type}</strong> {v.src}
                {v.duration ? ` · ${Math.round(v.duration / 60)} min` : ''}
              </p>
            ))}
          </section>

          <button className="secondary" onClick={inspect}>{copied ? 'Copiado!' : 'Inspecionar página (copiar estrutura)'}</button>
        </>
      )}

      {/* Sempre visível: mostra a gravação em andamento mesmo se você trocar de página */}
      <Transcription
        lesson={
          state.status === 'ready' && state.info.kind === 'lesson'
            ? { url: state.info.url, title: state.info.title, course: state.info.course }
            : null
        }
      />

      {state.status === 'ready' && state.info.kind === 'lesson' && (
        <Summary lesson={{ url: state.info.url, title: state.info.title, course: state.info.course }} />
      )}

      <Settings />
    </main>
  )
}
