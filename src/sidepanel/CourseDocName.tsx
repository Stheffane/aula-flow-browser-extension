import { useEffect, useState } from 'react'
import { useStorage } from './useStorage'
import { setRecord } from '../shared/storage'

/**
 * Nome do Google Docs desta matéria. Vazio = nome automático.
 * Cada matéria (curso/disciplina) tem o próprio documento e a própria pasta no Drive.
 */
export function CourseDocName({ course }: { course: string }) {
  const [titles] = useStorage('courseTitles')
  const [value, setValue] = useState(titles[course] ?? '')
  useEffect(() => setValue(titles[course] ?? ''), [titles, course])

  return (
    <label className="small">
      Nome do documento desta matéria
      <input
        placeholder={`${course} · Material de estudo`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        // Salva ao sair do campo, para não gravar a cada tecla.
        onBlur={() => setRecord('courseTitles', course, value.trim())}
      />
      <span className="muted">Vale na próxima criação/atualização do documento (renomeia se já existir).</span>
    </label>
  )
}
