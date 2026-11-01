import { defineManifest } from '@crxjs/vite-plugin'
import { loadEnv } from 'vite'
import pkg from './package.json'

/**
 * Chave pública fixa: garante que o ID da extensão seja sempre o mesmo
 * (gcedafbpimomohmmepchokblmobacpfi), que é o ID cadastrado no OAuth do Google.
 */
const KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlq9WoWEkW/8CKZ+q5xqtdUqp06AZLRYSlY2resaks3Xaht87wVv+bRUt5yOThQd0URQt1wB6xpvtma2Y850YeQbhO/iKZJhdZnTm7gPN7QQzNZE0YIFKjkUfWE4ybSKs0GyuuCSUOidNVC9jJZWWiiDVhj6ARSX9NIAloUkk1YrvqOx6NPJB5OWL1fv5iUJBs2Md+9z5GliTJHnkv4t23Okk5VJlJCpbSjO2oC/XzR5bfdvMY1hqi/i2e5kbSh8DwVvkEtby8n2O/cd0xOKnhfRx11jOQ2A1Ubf93NDpgaGHISFGkB+Mo6Nc/OaimGUY7DXf13yZJSLlV6HaUlla+QIDAQAB'

export default defineManifest(({ mode }) => {
  // O client ID do OAuth vem do arquivo .env (não vai para o repositório). Ver .env.example.
  const env = loadEnv(mode, '.')
  if (!env.VITE_GOOGLE_CLIENT_ID) console.warn('\n⚠ VITE_GOOGLE_CLIENT_ID não definido no .env: a extensão funciona, mas sem criar Google Docs.\n')

  return {
    manifest_version: 3,
    name: 'Aula Flow',
    version: pkg.version,
    description: pkg.description,
    key: KEY,
    action: { default_title: 'Abrir Aula Flow' },
    side_panel: { default_path: 'src/sidepanel/index.html' },
    background: { service_worker: 'src/background/index.ts', type: 'module' },
    permissions: ['sidePanel', 'storage', 'tabs', 'webNavigation', 'tabCapture', 'offscreen', 'scripting', 'identity', 'identity.email'],
    // Sem client ID o Chrome recusa o manifest, então o bloco só entra quando ele existe.
    ...(env.VITE_GOOGLE_CLIENT_ID && {
      oauth2: {
        client_id: env.VITE_GOOGLE_CLIENT_ID,
        // Só acessa os arquivos criados pela própria extensão.
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      },
    }),
    // Plataformas suportadas. Para adicionar outra: novo adaptador em src/platforms + domínio aqui.
    host_permissions: [
      'https://*.platosedu.io/*',
      'https://*.mdstrm.com/*',
      'https://api.groq.com/*',
      'https://api.openai.com/*',
      'https://generativelanguage.googleapis.com/*',
      'https://www.googleapis.com/*',
    ],
    content_scripts: [
      {
        matches: ['https://*.platosedu.io/*'],
        js: ['src/content/index.ts'],
        all_frames: true,
        run_at: 'document_idle',
      },
      {
        // Players de vídeo embutidos: controla play/pausa e grava o áudio do vídeo.
        matches: ['https://*.mdstrm.com/*'],
        js: ['src/content/player.ts'],
        all_frames: true,
        run_at: 'document_idle',
      },
    ],
  }
})
