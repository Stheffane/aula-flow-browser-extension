import { useStorage } from './useStorage'
import { PROVIDERS, type ProviderId } from '../shared/transcription'
import { SUMMARY_PROVIDERS, type SummaryProviderId } from '../shared/summary'
import type { KeyId } from '../shared/storage'
import { GoogleAccount } from './GoogleAccount'
import { DataSettings } from './DataSettings'

const RATES = [1, 1.25, 1.5, 2]
const KEY_LABEL: Record<KeyId, { name: string; url: string }> = {
  groq: { name: 'Groq', url: PROVIDERS.groq.keyUrl },
  openai: { name: 'OpenAI', url: PROVIDERS.openai.keyUrl },
  gemini: { name: 'Gemini (Google AI Studio)', url: 'https://aistudio.google.com/apikey' },
}

export function Settings() {
  const [settings, setSettings] = useStorage('settings')
  // Só pede as chaves dos serviços escolhidos (a do Groq serve para os dois).
  const neededKeys = [...new Set<KeyId>([settings.transcriptionProvider, SUMMARY_PROVIDERS[settings.summaryProvider].key])]
  const missingKey = neededKeys.some((k) => !settings.apiKeys[k])

  return (
    <details className="card" open={missingKey}>
      <summary>Configurações</summary>
      <label>
        Transcrição
        <select
          value={settings.transcriptionProvider}
          onChange={(e) => setSettings({ ...settings, transcriptionProvider: e.target.value as ProviderId })}
        >
          {Object.entries(PROVIDERS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Resumo (os outros provedores gratuitos entram como reserva automática)
        <select
          value={settings.summaryProvider}
          onChange={(e) => setSettings({ ...settings, summaryProvider: e.target.value as SummaryProviderId })}
        >
          {Object.entries(SUMMARY_PROVIDERS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {neededKeys.map((id) => (
        <label key={id}>
          Chave {KEY_LABEL[id].name}
          <input
            type="password"
            placeholder="Cole a chave aqui"
            value={settings.apiKeys[id]}
            onChange={(e) => setSettings({ ...settings, apiKeys: { ...settings.apiKeys, [id]: e.target.value.trim() } })}
          />
          <a className="small" href={KEY_LABEL[id].url} target="_blank" rel="noreferrer">
            Gerar uma chave
          </a>
        </label>
      ))}
      <label>
        Velocidade do vídeo na captura
        <select
          value={settings.playbackRate}
          onChange={(e) => setSettings({ ...settings, playbackRate: Number(e.target.value) })}
        >
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}x
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.muteTabWhileProcessing}
          onChange={(e) => setSettings({ ...settings, muteTabWhileProcessing: e.target.checked })}
        />
        Silenciar a aba ao processar módulo/curso (não afeta a gravação)
      </label>
      <p className="muted small">As chaves ficam salvas só neste navegador.</p>
      <hr />
      <GoogleAccount />
      <hr />
      <DataSettings />
    </details>
  )
}
