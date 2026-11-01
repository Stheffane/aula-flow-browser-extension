import { getItem } from './storage'

/**
 * Google Drive/Docs com o login padrão do Google (OAuth via chrome.identity.launchWebAuthFlow).
 * Funciona com qualquer Gmail, independente da conta logada no Chrome.
 * Escopo drive.file: a extensão só enxerga os arquivos e pastas que ela mesma criou.
 */
const DRIVE = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER = 'application/vnd.google-apps.folder'
const SCOPES = 'https://www.googleapis.com/auth/drive.file email'

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

interface Session {
  token: string
  expiresAt: number
  email?: string
}

/** O token fica no storage.session: some quando o navegador fecha e dura ~1 h. */
async function getSession(): Promise<Session | undefined> {
  const { google } = (await chrome.storage.session.get('google')) as { google?: Session }
  return google && google.expiresAt > Date.now() + 60_000 ? google : undefined
}

function authUrl(googleEmail: string, interactive: boolean) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    response_type: 'token',
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: SCOPES,
    ...(googleEmail && { login_hint: googleEmail }),
    ...(interactive ? (googleEmail ? {} : { prompt: 'select_account' }) : { prompt: 'none' }),
  }).toString()
  return url.href
}

/**
 * Login interativo numa aba normal do Chrome (sempre visível, ao contrário da janela
 * do launchWebAuthFlow, que no Windows pode abrir escondida). Quando o Google redireciona
 * para o endereço da extensão, pegamos o token da URL e fechamos a aba.
 * Precisa rodar numa página da extensão (o painel), que fica aberta durante o login.
 */
function loginInTab(url: string): Promise<string> {
  const redirectPrefix = chrome.identity.getRedirectURL()
  return new Promise((resolve, reject) => {
    let tabId: number | undefined
    const done = (fn: () => void) => {
      chrome.tabs.onUpdated.removeListener(onUpdated)
      chrome.tabs.onRemoved.removeListener(onRemoved)
      clearTimeout(timer)
      fn()
    }
    const onUpdated = (id: number, change: chrome.tabs.OnUpdatedInfo) => {
      if (id !== tabId || !change.url?.startsWith(redirectPrefix)) return
      done(() => resolve(change.url!))
      chrome.tabs.remove(id).catch(() => undefined)
    }
    const onRemoved = (id: number) => {
      if (id === tabId) done(() => reject(new Error('Login do Google cancelado (a aba foi fechada).')))
    }
    const timer = setTimeout(() => done(() => reject(new Error('Login do Google: tempo esgotado.'))), 5 * 60_000)

    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs.onRemoved.addListener(onRemoved)
    chrome.tabs.create({ url }).then((tab) => (tabId = tab.id))
  })
}

/** Renovação silenciosa (sem tela), enquanto você estiver logado no Google neste navegador. */
async function silentLogin(url: string) {
  return chrome.identity.launchWebAuthFlow({
    url,
    interactive: false,
    abortOnLoadForNonInteractive: true,
    timeoutMsForNonInteractive: 10_000,
  })
}

let pending: Promise<Session> | null = null

/** Faz login no Google. `interactive: true` abre uma aba de login; `false` tenta em silêncio. */
export function signIn(interactive: boolean): Promise<Session> {
  // Evita dois logins ao mesmo tempo (o Chrome só permite um).
  pending ??= doSignIn(interactive).finally(() => (pending = null))
  return pending
}

async function doSignIn(interactive: boolean): Promise<Session> {
  if (!GOOGLE_CLIENT_ID) throw new Error('Falta o VITE_GOOGLE_CLIENT_ID no arquivo .env.')
  const { googleEmail } = await getItem('settings')
  const url = authUrl(googleEmail, interactive)

  let redirect: string | undefined
  try {
    redirect = interactive ? await loginInTab(url) : await silentLogin(url)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(msg.startsWith('Login do Google') ? msg : `Login do Google: ${msg}`)
  }

  const params = new URLSearchParams(new URL(redirect ?? '').hash.slice(1))
  if (params.get('error')) throw new Error(`Login do Google: ${params.get('error')}`)
  const token = params.get('access_token')
  if (!token) throw new Error('Login do Google não retornou o acesso.')

  const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r): Promise<{ email?: string }> => (r.ok ? r.json() : Promise.resolve({})))

  const session: Session = { token, expiresAt: Date.now() + Number(params.get('expires_in') ?? 3600) * 1000, email: info.email }
  await chrome.storage.session.set({ google: session })
  return session
}

export async function signOut() {
  await chrome.storage.session.remove('google')
}

/** Conta conectada agora (sem abrir login). */
export async function currentAccount() {
  return (await getSession())?.email
}

/** Token válido: o salvo, ou renovado em silêncio. Se não der, pede para conectar no painel. */
async function getToken() {
  const session =
    (await getSession()) ??
    (await signIn(false).catch(() => {
      throw new Error('Conecte sua conta Google em Configurações → Conectar.')
    }))
  return session.token
}

/** Faz a requisição com o token; se ele foi recusado, faz login de novo uma vez. */
async function google(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = await getToken()
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
  if (res.status === 401 && retry) {
    await signOut()
    return google(url, init, false)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(`Google: ${body?.error?.message ?? `erro ${res.status}`}`)
  }
  return res
}

const quote = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/** Encontra (ou cria) uma pasta pelo nome dentro de `parentId` (ou na raiz do Drive). */
export async function ensureFolder(name: string, parentId?: string): Promise<string> {
  const q = [`name = '${quote(name)}'`, `mimeType = '${FOLDER}'`, 'trashed = false', parentId && `'${parentId}' in parents`]
    .filter(Boolean)
    .join(' and ')
  const found = await (await google(`${DRIVE}?q=${encodeURIComponent(q)}&fields=files(id)`)).json()
  if (found.files?.length) return found.files[0].id

  const created = await google(DRIVE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: parentId ? [parentId] : undefined }),
  })
  return (await created.json()).id
}

/**
 * Cria um Google Docs a partir de HTML: o Drive converte títulos, listas, negrito e código
 * para a formatação nativa do Docs. Se `fileId` for informado, substitui o conteúdo do doc existente.
 */
export async function upsertDocFromHtml(opts: { title: string; html: string; folderId: string; fileId?: string }) {
  const metadata = opts.fileId
    ? { name: opts.title }
    : { name: opts.title, mimeType: 'application/vnd.google-apps.document', parents: [opts.folderId] }

  const boundary = 'aulaflow' + Date.now()
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    opts.html,
    `--${boundary}--`,
  ].join('\r\n')

  const url = opts.fileId ? `${UPLOAD}/${opts.fileId}` : UPLOAD
  const res = await google(`${url}?uploadType=multipart&fields=id,webViewLink`, {
    method: opts.fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return (await res.json()) as { id: string; webViewLink: string }
}

/** Confere se o doc ainda existe (não foi apagado/enviado para a lixeira). */
export async function docExists(fileId: string) {
  try {
    const res = await google(`${DRIVE}/${fileId}?fields=trashed`)
    return !(await res.json()).trashed
  } catch {
    return false
  }
}
