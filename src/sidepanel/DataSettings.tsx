import { useEffect, useState } from 'react'
import { DEFAULTS, getItem, setItem } from '../shared/storage'
import { signOut } from '../shared/google'

/** Dados de processamento: o que é apagado em "Limpar dados de processamento". */
const PROCESSING = ['job', 'run', 'transcripts', 'summaries', 'lessonMeta'] as const

/**
 * Limpeza dos dados da extensão (útil para testes).
 * - Processamento: apaga transcrições, materiais e progresso; mantém chaves, login e links dos documentos.
 * - Tudo: volta a extensão ao estado de instalação.
 */
export function DataSettings() {
  const [usage, setUsage] = useState({ bytes: 0, lessons: 0 })
  const [message, setMessage] = useState('')

  async function refresh() {
    const [bytes, transcripts] = await Promise.all([chrome.storage.local.getBytesInUse(null), getItem('transcripts')])
    setUsage({ bytes, lessons: Object.keys(transcripts).length })
  }

  useEffect(() => {
    refresh()
  }, [])

  async function clearProcessing() {
    const ok = confirm(
      `Apagar ${usage.lessons} transcrição(ões), os materiais gerados e o progresso?\n\n` +
        'As transcrições custam o tempo de assistir aos vídeos de novo. Os documentos no Google Docs NÃO são apagados ' +
        '(mas serão regerados só com as aulas processadas daqui para frente). Chaves e login continuam.',
    )
    if (!ok) return
    await Promise.all(PROCESSING.map((k) => setItem(k, DEFAULTS[k])))
    chrome.action.setBadgeText({ text: '' })
    setMessage('Dados de processamento apagados.')
    refresh()
  }

  async function clearAll() {
    if (!confirm('Apagar TUDO: transcrições, materiais, chaves de API, nomes e links dos documentos e o login do Google?')) return
    await chrome.storage.local.clear()
    await signOut()
    chrome.action.setBadgeText({ text: '' })
    setMessage('Tudo apagado. A extensão voltou ao estado de instalação.')
    refresh()
  }

  return (
    <div className="stack">
      <strong className="small">Dados da extensão</strong>
      <p className="small muted">
        {usage.lessons} aula(s) transcrita(s) · {(usage.bytes / 1024).toFixed(0)} KB salvos neste navegador
      </p>
      <button className="secondary" onClick={clearProcessing}>
        Limpar dados de processamento
      </button>
      <button className="danger" onClick={clearAll}>
        Apagar tudo (inclui chaves e login)
      </button>
      {message && <p className="small">{message}</p>}
    </div>
  )
}
