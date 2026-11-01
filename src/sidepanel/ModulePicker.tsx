import { useStorage } from './useStorage'
import { setRecord } from '../shared/storage'

/**
 * Módulo da aula atual, usado para organizar o documento do curso.
 * (Por enquanto escolhido à mão; na etapa 5 a navegação pelo módulo preenche sozinha.)
 */
export function ModulePicker({ lessonUrl, modules }: { lessonUrl: string; modules: string[] }) {
  const [meta] = useStorage('lessonMeta')
  const value = meta[lessonUrl]?.module ?? ''
  const options = [...new Set([...modules, value].filter(Boolean))]

  return (
    <label className="inline">
      Módulo
      <select value={value} onChange={(e) => setRecord('lessonMeta', lessonUrl, { module: e.target.value || undefined })}>
        <option value="">Escolha…</option>
        {options.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </label>
  )
}
