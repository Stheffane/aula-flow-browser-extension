/**
 * Limpeza local da transcrição antes de enviar para a IA (não usa IA, não custa nada).
 * Remove vícios de fala que viram frases soltas ("Perfeito.", "Beleza?", "Né?") e palavras
 * repetidas em sequência ("que que", "o o"). O texto original continua salvo; só a cópia
 * enviada para a IA é limpa.
 */
const FILLERS = [
  'perfeito', 'beleza', 'certo', 'ok', 'okay', 'tá', 'tá bom', 'tá certo', 'né', 'show', 'show de bola',
  'legal', 'bacana', 'pronto', 'então', 'enfim', 'e aí', 'tranquilo', 'combinado', 'cara', 'gente', 'galera',
]

// Vício de fala "solto": sozinho entre pontuações (ex.: ". Perfeito? Então, ..." → ". Então, ...").
const loneFiller = new RegExp(`(^|[.!?…]\\s+)(?:(?:${FILLERS.join('|')})[\\s,]*)+[.!?…]+(?=\\s|$)`, 'gi')
// "né" e "tá" no fim de frase ("isso aqui, né?" → "isso aqui?").
const tagFiller = /,?\s+(?:né|tá)(?=[?.!,])/gi
// Palavra repetida em sequência ("que que", "o o").
// (\b não entende acentos: "então o" viraria "entã" + "o o"; por isso as checagens com \p{L}.)
const repeated = /(?<!\p{L})(\p{L}+)(?:\s+\1)+(?!\p{L})/giu

export function cleanTranscript(text: string) {
  let out = text
  for (let i = 0; i < 3; i++) out = out.replace(loneFiller, '$1') // repete: fillers em sequência
  return out
    .replace(tagFiller, '')
    .replace(repeated, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim()
}
