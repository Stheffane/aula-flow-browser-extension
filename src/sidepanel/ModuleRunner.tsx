import { useStorage } from './useStorage'
import { getActiveTab } from '../shared/tabs'
import type { Message, PageInfo, Run } from '../shared/types'

const ICON: Record<Run['items'][number]['status'], string> = {
  pending: '○',
  running: '●',
  done: '✓',
  skipped: '↷',
  error: '!',
}

/** Processa um módulo inteiro: abre cada aula, transcreve, resume e atualiza o documento. */
export function ModuleRunner({ info }: { info?: PageInfo }) {
  const [run] = useStorage('run')
  const [settings] = useStorage('settings')
  const module = info?.outline?.find((m) => m.name === info.module)
  const current = module?.items.find((i) => i.current)
  const running = run?.status === 'running'
  const missingKeys = !settings.apiKeys[settings.transcriptionProvider] || !settings.apiKeys[settings.summaryProvider]

  async function start(fromCurrent: boolean) {
    const tab = await getActiveTab()
    if (!tab?.id || !module || !info) return
    chrome.runtime.sendMessage({
      type: 'RUN_START',
      tabId: tab.id,
      course: info.course,
      module,
      startId: fromCurrent && current ? current.id : module.items[0].id,
    } satisfies Message)
  }

  const stop = () => chrome.runtime.sendMessage({ type: 'RUN_STOP' } satisfies Message)

  // Mostra o processamento em andamento (ou o último) mesmo se a página atual não tiver menu.
  if (run && (running || !module)) {
    const done = run.items.filter((i) => i.status === 'done' || i.status === 'skipped').length
    return (
      <section className="card stack">
        <div className="row">
          <h3>{run.module}</h3>
          <span className="small muted">
            {done}/{run.items.length} aulas
          </span>
        </div>
        <progress value={done} max={run.items.length} />
        <ul className="run-list">
          {run.items.map((i) => (
            <li key={i.id} className={i.status}>
              <span>{ICON[i.status]}</span> {i.label}
              {i.error && <div className="error small">{i.error}</div>}
            </li>
          ))}
        </ul>
        {running ? (
          <>
            <p className="small muted">Mantenha a aba da aula aberta. Você pode fechar este painel.</p>
            <button className="secondary" onClick={stop}>
              Parar
            </button>
          </>
        ) : (
          <p className="small">{run.status === 'done' ? '✓ Módulo concluído.' : run.error ?? 'Processamento parado.'}</p>
        )}
      </section>
    )
  }

  if (!module || !info) return null

  return (
    <section className="card stack">
      <h3>Processar {module.name}</h3>
      <p className="small muted">
        {module.items.length} aulas. A extensão abre cada uma, transcreve, gera o material de estudo e atualiza o
        documento do curso. Aulas já processadas são puladas.
      </p>
      {run?.status && run.status !== 'running' && run.module === module.name && (
        <p className="small">{run.status === 'done' ? '✓ Último processamento concluído.' : run.error ?? 'Último processamento parado.'}</p>
      )}
      {missingKeys && <p className="error small">Configure as chaves de transcrição e resumo antes.</p>}
      <button onClick={() => start(false)} disabled={missingKeys}>
        Processar módulo inteiro
      </button>
      {current && current.id !== module.items[0].id && (
        <button className="secondary" onClick={() => start(true)} disabled={missingKeys}>
          A partir desta aula ({current.label.split(' · ')[0]})
        </button>
      )}
    </section>
  )
}
