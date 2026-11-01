import { useEffect, useState } from 'react'
import { DEFAULTS, getItem, setItem, withDefaults, type StorageShape } from '../shared/storage'

/** Lê um valor do chrome.storage e mantém sincronizado (o background também escreve nele). */
export function useStorage<K extends keyof StorageShape>(key: K) {
  const [value, setValue] = useState<StorageShape[K]>(DEFAULTS[key])

  useEffect(() => {
    getItem(key).then(setValue)
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (key in changes) setValue(withDefaults(key, changes[key].newValue))
    }
    chrome.storage.local.onChanged.addListener(onChanged)
    return () => chrome.storage.local.onChanged.removeListener(onChanged)
  }, [key])

  return [value, (v: StorageShape[K]) => setItem(key, v)] as const
}
