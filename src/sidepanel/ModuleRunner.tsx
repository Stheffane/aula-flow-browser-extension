import { useStorage } from './useStorage'
import { getActiveTab } from '../shared/tabs'
import { CourseDocName } from './CourseDocName'
import { SUMMARY_PROVIDERS } from '../shared/summary'
import type { Message, OutlineModule, PageInfo, Run, RunItemInput } from '../shared/types'

type RunItem = Run['items'][number]

const ICON: Record<RunItem['status'], string> = {
  pending: '○',
  running: '●',
  done: '✓',
  skipped: '↷',
  transcribed: '◐',
  error: '!',
}

/** Só módulos de aula entram no "curso inteiro" (Podcast e Avaliação ficam de fora). */
const isLessonModule = (m: OutlineModule) => /^m[óo]dulo/i.test(m.name)

const toItems = (modules: OutlineModule[]): RunItemInput[] =>
  modules.flatMap((m) => m.items.map((i, order) => ({ ...i, module: m.name, order })))

/** Agrupa os itens por módulo, para a lista do curso inteiro ficar legível. */
function groupByModule(items: RunItem[]) {
  const groups: { module: string; items: RunItem[] }[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last?.module === item.module) last.items.push(item)
    else groups.push({ module: item.module, items: [item] })
  }
  return groups
}

/** Processa um módulo ou o curso inteiro: abre cada aula, transcreve, gera o material e atualiza o documento. */
export function ModuleRunner({ info }: { info?: PageInfo }) {
  const [run] = useStorage('run')
  const [settings] = useStorage('settings')
  const module = info?.outline?.find((m) => m.name === info.module)
  const courseModules = info?.outline?.filter(isLessonModule) ?? []
  const current = module?.items.find((i) => i.current)
  const running = run?.status === 'running'
  const missingKeys = !settings.apiKeys[settings.transcriptionProvider] || !settings.apiKeys[SUMMARY_PROVIDERS[settings.summaryProvider].key]

  async function start(label: string, items: RunItemInput[]) {
    const tab = await getActiveTab()
    if (!tab?.id || !items.length) return
    chrome.runtime.sendMessage({ type: 'RUN_START', tabId: tab.id, course: info?.course ?? run?.course, label, items } satisfies Message)
  }

  const stop = () => chrome.runtime.sendMessage({ type: 'RUN_STOP' } satisfies Message)
  const retry = (items: RunItem[]) =>
    start(
      items.length === 1 ? items[0].label.split(' · ')[0] : `${run?.label} (erros)`,
      items.map(({ id, label, current, module, order }) => ({ id, label, current, module, order })),
    )

  const runCard = run && (running || !module) && (
    <RunProgress run={run} onStop={stop} onRetry={retry} canRetry={!running && !!info?.outline && !missingKeys} />
  )
  if (runCard) return runCard
  if (!module || !info) return null

  const courseCount = courseModules.reduce((n, m) => n + m.items.length, 0)
  const lastErrors = run && run.status !== 'running' ? run.items.filter((i) => i.status === 'error') : []

  return (
    <section className="card stack">
      <h3>Processar aulas</h3>
      <p className="small">
        Matéria: <strong>{info.course ?? 'não identificada'}</strong>
      </p>
      {info.course && <CourseDocName course={info.course} />}
      <p className="small muted">
        A extensão abre cada aula, transcreve, gera o material de estudo e atualiza o documento do curso. Aulas já
        processadas são puladas.
      </p>
      {missingKeys && <p className="error small">Configure as chaves de transcrição e resumo antes.</p>}

      <button onClick={() => start(module.name, toItems([module]))} disabled={missingKeys}>
        Processar {module.name} ({module.items.length} aulas)
      </button>
      {current && current.id !== module.items[0].id && (
        <button
          className="secondary"
          disabled={missingKeys}
          onClick={() => start(module.name, toItems([module]).filter((i) => i.order >= module.items.indexOf(current)))}
        >
          {module.name} a partir desta aula ({current.label.split(' · ')[0]})
        </button>
      )}
      {courseModules.length > 1 && (
        <button className="secondary" onClick={() => start('Curso inteiro', toItems(courseModules))} disabled={missingKeys}>
          Processar curso inteiro ({courseCount} aulas)
        </button>
      )}

      {run && run.status !== 'running' && <LastRun run={run} />}

      {lastErrors.length > 0 && (
        <button className="ghost" onClick={() => retry(lastErrors)} disabled={missingKeys}>
          Refazer {lastErrors.length} aula(s) com erro do último processamento
        </button>
      )}
    </section>
  )
}

function RunProgress({
  run,
  onStop,
  onRetry,
  canRetry,
}: {
  run: Run
  onStop: () => void
  onRetry: (items: RunItem[]) => void
  canRetry: boolean
}) {
  const running = run.status === 'running'
  const finished = run.items.filter((i) => i.status === 'done' || i.status === 'skipped').length
  const errors = run.items.filter((i) => i.status === 'error')
  const groups = groupByModule(run.items)

  return (
    <section className="card stack">
      <div className="row">
        <h3>{run.label}</h3>
        <span className="small muted">
          {finished}/{run.items.length} aulas
        </span>
      </div>
      <progress value={finished + errors.length + run.items.filter((i) => i.status === 'transcribed').length / 2} max={run.items.length} />
      {running && (
        <p className="small phase">
          {run.phase === 'summarize'
            ? `Gerando os materiais${run.summarizing ? ` do ${run.summarizing}` : ''} e atualizando o documento (pode levar alguns minutos)…`
            : 'Transcrevendo as aulas (◐ = transcrita; o material sai no fim de cada módulo)'}
        </p>
      )}
      <div className="run-list-box">
        {groups.map((g) => (
          <div key={g.module}>
            {groups.length > 1 && <p className="small run-module">{g.module}</p>}
            <ul className="run-list">
              {g.items.map((i) => (
                <li key={i.id} className={i.status}>
                  <span>{ICON[i.status]}</span> {i.label}
                  {i.error && (
                    <div className="error small">
                      {i.error}{' '}
                      {canRetry && (
                        <button className="link" onClick={() => onRetry([i])}>
                          Tentar de novo
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {running ? (
        <>
          <p className="small muted">Mantenha a aba da aula aberta. Você pode fechar este painel.</p>
          <button className="secondary" onClick={onStop}>
            Parar
          </button>
        </>
      ) : (
        <>
          <p className="small">
            {run.status === 'done'
              ? errors.length
                ? `Concluído com ${errors.length} erro(s).`
                : '✓ Concluído.'
              : (run.error ?? 'Processamento parado.')}
          </p>
          {canRetry && errors.length > 1 && (
            <button className="secondary" onClick={() => onRetry(errors)}>
              Refazer {errors.length} aulas com erro
            </button>
          )}
          {!canRetry && errors.length > 0 && (
            <p className="small muted">Para tentar de novo, abra uma aula do curso com o painel aberto.</p>
          )}
        </>
      )}
    </section>
  )
}

/** Resultado do último processamento, mostrado junto dos botões (inclui o motivo de uma pausa). */
function LastRun({ run }: { run: Run }) {
  const count = (s: RunItem['status']) => run.items.filter((i) => i.status === s).length
  const parts = [
    count('done') && `${count('done')} processada(s)`,
    count('transcribed') && `${count('transcribed')} transcrita(s) aguardando material`,
    count('skipped') && `${count('skipped')} já pronta(s)`,
    count('error') && `${count('error')} com erro`,
    count('pending') && `${count('pending')} não iniciada(s)`,
  ].filter(Boolean)
  return (
    <div className="last-run small">
      <strong>Último processamento ({run.label}):</strong> {parts.join(' · ') || 'nenhuma aula'}
      {run.status !== 'done' && run.error && <p className="error small">{run.error}</p>}
      {run.status === 'stopped' && !run.error && <p className="small muted">Parado por você.</p>}
    </div>
  )
}
