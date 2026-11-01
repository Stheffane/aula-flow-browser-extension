import { useStorage } from './useStorage'
import { setRecord } from '../shared/storage'

/**
 * Módulo da aula atual, usado para organizar o documento do curso.
 * Vem do menu da plataforma quando dá para detectar; pode ser trocado à mão.
 */
export function ModulePicker({ lessonUrl, modules, detected }: { lessonUrl: string; modules: string[]; detected?: string }) {
  const [meta] = useStorage('lessonMeta')
  // O módulo detectado na página vale até você escolher outro.
  const value = meta[lessonUrl]?.module ?? detected ?? ''
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
