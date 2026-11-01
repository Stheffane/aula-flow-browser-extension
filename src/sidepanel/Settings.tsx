import { useStorage } from './useStorage'
import { PROVIDERS, type ProviderId } from '../shared/transcription'

const RATES = [1, 1.25, 1.5, 2]

export function Settings() {
  const [settings, setSettings] = useStorage('settings')
  const provider = settings.transcriptionProvider
  const apiKey = settings.apiKeys[provider]

  return (
    <details className="card" open={!apiKey}>
      <summary>Configurações</summary>
      <label>
        Transcrição
        <select
          value={provider}
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
        Chave da API
        <input
          type="password"
          placeholder="Cole a chave aqui"
          value={apiKey}
          onChange={(e) =>
            setSettings({ ...settings, apiKeys: { ...settings.apiKeys, [provider]: e.target.value.trim() } })
          }
        />
        <a className="small" href={PROVIDERS[provider].keyUrl} target="_blank" rel="noreferrer">
          Gerar uma chave
        </a>
      </label>
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
      <p className="muted small">As chaves ficam salvas só neste navegador.</p>
    </details>
  )
}
