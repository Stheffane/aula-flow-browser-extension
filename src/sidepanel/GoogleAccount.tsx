import { useEffect, useState } from 'react'
import { useStorage } from './useStorage'
import { currentAccount, GOOGLE_CLIENT_ID, signIn, signOut } from '../shared/google'

/** Conta Google onde os documentos são criados. Pode ser qualquer Gmail. */
export function GoogleAccount() {
  const [settings, setSettings] = useStorage('settings')
  const [email, setEmail] = useState<string>()
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    currentAccount().then(setEmail)
    // O login acontece no background; o painel só observa a sessão salva.
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>) => {
      if ('google' in changes) currentAccount().then(setEmail)
    }
    chrome.storage.session.onChanged.addListener(onChanged)
    return () => chrome.storage.session.onChanged.removeListener(onChanged)
  }, [])

  if (!GOOGLE_CLIENT_ID) {
    return <p className="small muted">Google Docs desativado: falta o VITE_GOOGLE_CLIENT_ID no arquivo .env.</p>
  }

  async function connect() {
    setError('')
    setWaiting(true)
    try {
      await signIn(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setWaiting(false)
    }
  }

  async function disconnect() {
    await signOut()
    setEmail(undefined)
  }

  return (
    <div className="stack">
      <label>
        Gmail para os documentos (opcional)
        <input
          type="email"
          placeholder="voce@gmail.com"
          value={settings.googleEmail}
          onChange={(e) => setSettings({ ...settings, googleEmail: e.target.value.trim() })}
        />
      </label>
      <div className="row">
        <span className="small">{email ? <>Conectado: <strong>{email}</strong></> : 'Google não conectado'}</span>
        <button className="ghost" onClick={email ? disconnect : connect} disabled={waiting}>
          {waiting ? 'Aguardando…' : email ? 'Desconectar' : 'Conectar'}
        </button>
      </div>
      {waiting && (
        <p className="small">
          Faça o login na aba do Google que abriu. Ela fecha sozinha ao terminar (fechar a aba cancela o login).
        </p>
      )}
      <p className="small muted">Os documentos são criados na conta conectada. O Gmail informado já vem preenchido no login.</p>
      {error && <p className="error small">{error}</p>}
    </div>
  )
}
