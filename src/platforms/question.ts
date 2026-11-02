import type { Question } from '../shared/types'

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
/** innerText respeita quebras de bloco ("Questão 3" + "Em uma rede…" não grudam). */
const textOf = (el: Element | null | undefined) => clean((el as HTMLElement | null)?.innerText ?? el?.textContent)

/** Texto da alternativa: o <label> ligado ao input, ou o elemento clicável em volta dele. */
function optionText(input: Element): string {
  const id = input.getAttribute('id')
  const label = (id && input.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`)) || input.closest('label')
  if (label) return textOf(label)
  // Ex.: Chakra/MUI: o input fica dentro de um container com o texto ao lado.
  let el: Element | null = input.parentElement
  for (let i = 0; el && i < 3 && !textOf(el); i++) el = el.parentElement
  return textOf(el)
}

/** Menor elemento que contém todos os itens. */
function commonAncestor(els: Element[]): Element | null {
  let anc: Element | null = els[0]?.parentElement ?? null
  while (anc && !els.every((e) => anc!.contains(e))) anc = anc.parentElement
  return anc
}

/**
 * Lê a pergunta visível na página de forma genérica: acha um grupo de alternativas
 * (radio/checkbox, nativos ou com role) e pega o texto em volta como enunciado.
 */
export function readQuestion(doc: Document): Question | undefined {
  const inputs = [
    ...doc.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]'),
  ]
  if (inputs.length < 2) return undefined

  // Agrupa por "name" (ou pelo radiogroup em volta) e usa o primeiro grupo com 2+ alternativas.
  const groups = new Map<string, Element[]>()
  for (const input of inputs) {
    const key = input.getAttribute('name') ?? input.closest('[role="radiogroup"], [role="group"]')?.id ?? 'grupo'
    groups.set(key, [...(groups.get(key) ?? []), input])
  }
  const group = [...groups.values()].find((g) => g.length >= 2)
  if (!group) return undefined

  const options = group.map(optionText).filter(Boolean)
  const box = commonAncestor(group)
  if (!box || options.length < 2) return undefined

  // Enunciado: sobe a partir do bloco das alternativas até achar texto além delas.
  let container: Element | null = box
  let statement = ''
  for (let i = 0; container && i < 6; i++, container = container.parentElement) {
    let text = textOf(container)
    for (const o of options) text = text.replace(o, ' ')
    statement = clean(text)
    if (statement.length > 20) break
  }

  return {
    statement: statement.slice(0, 3000),
    options,
    multiple: group.some((g) => g.getAttribute('type') === 'checkbox' || g.getAttribute('role') === 'checkbox'),
  }
}
