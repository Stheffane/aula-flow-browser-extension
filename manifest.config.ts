import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'Aula Flow',
  version: pkg.version,
  description: pkg.description,
  action: { default_title: 'Abrir Aula Flow' },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  permissions: ['sidePanel', 'storage', 'tabs', 'webNavigation'],
  // Plataformas suportadas. Para adicionar outra: novo adaptador em src/platforms + domínio aqui.
  host_permissions: ['https://*.platosedu.io/*'],
  content_scripts: [
    {
      matches: ['https://*.platosedu.io/*'],
      js: ['src/content/index.ts'],
      all_frames: true,
      run_at: 'document_idle',
    },
  ],
})
