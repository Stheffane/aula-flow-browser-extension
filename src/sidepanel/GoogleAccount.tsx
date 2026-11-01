import { useEffect, useState } from 'react'

/**
 * Conta Google usada para criar os documentos.
 * O chrome.identity sempre usa a conta logada no perfil do Chrome, então não há campo de e-mail:
 * para usar outro Gmail, entre com ele no Chrome (ou use outro perfil do Chrome).
 */
export function GoogleAccount() {
  const [email, setEmail] = useState('')
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  async function check() {
    const info = await chrome.identity.getProfileUserInfo({ accountStatus: chrome.identity.AccountStatus.ANY })
    setEmail(info.email)
    const { token } = await chrome.identity.getAuthToken({ interactive: false }).catch(() => ({ token: undefined }))
    setConnected(!!token)
  }

  useEffect(() => {
    check()
  }, [])

  async function connect() {
    setError('')
    try {
      await chrome.identity.getAuthToken({ interactive: true })
      await check()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function disconnect() {
    await chrome.identity.clearAllCachedAuthTokens()
    setConnected(false)
  }

  if (!chrome.runtime.getManifest().oauth2) {
    return <p className="small muted">Google Docs desativado: falta o VITE_GOOGLE_CLIENT_ID no arquivo .env.</p>
  }

  return (
    <div className="stack">
      <div className="row">
        <span className="small">
          Google: {email ? <strong>{email}</strong> : 'nenhuma conta no Chrome'}
          {connected ? ' · conectado' : ''}
        </span>
        <button className="ghost" onClick={connected ? disconnect : connect}>
          {connected ? 'Desconectar' : 'Conectar'}
        </button>
      </div>
      <p className="small muted">
        Os documentos são criados na conta logada neste perfil do Chrome. Para usar outro Gmail, entre com ele no Chrome.
      </p>
      {error && <p className="error small">{error}</p>}
    </div>
  )
}
