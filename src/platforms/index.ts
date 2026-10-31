import type { PlatformAdapter } from './types'
import { platosAdapter } from './platos'
import { genericAdapter } from './generic'

// Ordem importa: o genérico fica por último como fallback.
const adapters: PlatformAdapter[] = [platosAdapter, genericAdapter]

export function getAdapter(url: URL): PlatformAdapter {
  return adapters.find((a) => a.matches(url)) ?? genericAdapter
}
