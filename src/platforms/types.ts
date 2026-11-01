import type { OutlineModule, PageInfo } from '../shared/types'

/**
 * Cada plataforma de estudo implementa este contrato.
 * Tudo que é específico da plataforma (URLs, seletores, navegação) fica no adaptador.
 */
export interface PlatformAdapter {
  id: string
  name: string
  matches(url: URL): boolean
  detect(doc: Document, url: URL): PageInfo
  /** Menu do curso (módulos → aulas). Opcional: só plataformas que suportam processar módulo. */
  outline?(doc: Document): OutlineModule[]
  /** Abre a aula `id` (ex.: clicando no menu). Resolve quando a aula carregou. */
  openLesson?(doc: Document, id: string): Promise<void>
}
