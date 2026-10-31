import type { PageInfo } from '../shared/types'

/**
 * Cada plataforma de estudo implementa este contrato.
 * Tudo que é específico da plataforma (URLs, seletores, navegação) fica no adaptador.
 */
export interface PlatformAdapter {
  id: string
  name: string
  matches(url: URL): boolean
  detect(doc: Document, url: URL): PageInfo
}
