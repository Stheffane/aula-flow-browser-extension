/**
 * Google Drive/Docs via chrome.identity (OAuth do próprio Chrome).
 * Escopo drive.file: a extensão só enxerga os arquivos e pastas que ela mesma criou.
 */
const DRIVE = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER = 'application/vnd.google-apps.folder'

async function getToken(interactive: boolean) {
  const { token } = await chrome.identity.getAuthToken({ interactive })
  if (!token) throw new Error('Não foi possível entrar na conta Google.')
  return token
}

/** Faz a requisição com o token; se ele expirou, renova uma vez e tenta de novo. */
async function google(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = await getToken(true)
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
  if (res.status === 401 && retry) {
    await chrome.identity.removeCachedAuthToken({ token })
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
