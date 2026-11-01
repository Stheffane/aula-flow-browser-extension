import { marked } from 'marked'
import { getItem, setRecord } from '../shared/storage'
import { docExists, ensureFolder, upsertDocFromHtml } from '../shared/google'

const ROOT_FOLDER = 'Aula Flow'
const NO_MODULE = 'Outras aulas'
/** Seções de cada aula que vão para as listas gerais no topo do documento. */
const PROJECTS = 'Atividades e projetos'
const MATERIALS = 'Materiais complementares'

interface Lesson {
  url: string
  title: string
  module: string
  createdAt: number
  sections: { heading: string; body: string }[]
}

/** Separa o Markdown de uma aula em título (# ...) e seções (## ...). */
function parseLesson(markdown: string) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const sections = markdown
    .split(/^##\s+/m)
    .slice(1)
    .map((chunk) => {
      const [heading, ...rest] = chunk.split('\n')
      return { heading: heading.trim(), body: rest.join('\n').trim() }
    })
  return { title, sections }
}

/** Desce um nível em todos os títulos (## → ###), para a aula caber dentro do módulo. */
const demote = (md: string) => md.replace(/^(#{1,5})\s/gm, '#$1 ')

const isEmpty = (body: string) => !body || /^nenhum(a)? nesta aula\.?$/i.test(body)

/** "Módulo 2" vem antes de "Módulo 10"; aulas sem módulo vão para o fim. */
function compareModules(a: string, b: string) {
  if (a === NO_MODULE) return 1
  if (b === NO_MODULE) return -1
  return a.localeCompare(b, 'pt-BR', { numeric: true })
}

/** Junta os resumos de todas as aulas do curso num único Markdown. */
export function buildCourseMarkdown(course: string, lessons: Lesson[]) {
  const byModule = new Map<string, Lesson[]>()
  for (const l of [...lessons].sort((a, b) => a.createdAt - b.createdAt)) {
    byModule.set(l.module, [...(byModule.get(l.module) ?? []), l])
  }
  const modules = [...byModule.keys()].sort(compareModules)

  // Listas gerais: o conteúdo de "Atividades e projetos" e "Materiais complementares" de cada aula.
  // Itens de lista repetidos (ex.: a mesma biblioteca citada em várias aulas) aparecem só na primeira vez.
  const collect = (heading: string) => {
    const seen = new Set<string>()
    return modules
      .flatMap((m) => byModule.get(m)!)
      .map((l) => {
        const body = (l.sections.find((s) => s.heading === heading)?.body ?? '')
          .split('\n')
          .filter((line) => {
            const item = line.match(/^\s*[-*]\s+(.+)/)?.[1]?.toLowerCase().trim()
            if (!item) return true
            if (seen.has(item)) return false
            seen.add(item)
            return true
          })
          .join('\n')
          .trim()
        return { l, body }
      })
      .filter(({ body }) => !isEmpty(body))
      .map(({ l, body }) => `### ${l.title} _(${l.module})_\n\n${demote(demote(body))}`)
      .join('\n\n')
  }

  const toc = modules
    .map((m) => `- **${m}**\n${byModule.get(m)!.map((l) => `  - ${l.title}`).join('\n')}`)
    .join('\n')

  const body = modules
    .map((m) => {
      const lessonsMd = byModule.get(m)!.map((l) => {
        const content = l.sections
          .filter((s) => s.heading !== PROJECTS && s.heading !== MATERIALS)
          .map((s) => `### ${s.heading}\n\n${demote(demote(s.body))}`)
          .join('\n\n')
        return `## ${l.title}\n\n${content}`
      })
      return `# ${m}\n\n${lessonsMd.join('\n\n')}`
    })
    .join('\n\n')

  const updated = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  return [
    `# ${course}`,
    `_Material de estudo gerado pelo Aula Flow · ${lessons.length} aula(s) · atualizado em ${updated}._`,
    `_Dica: no Google Docs, use Ver → Mostrar estrutura do documento para navegar pelos títulos._`,
    `# Sumário\n\n${toc}`,
    `# ${PROJECTS}\n\n${collect(PROJECTS) || 'Nenhuma atividade ou projeto até agora.'}`,
    `# ${MATERIALS}\n\n${collect(MATERIALS) || 'Nenhum material citado até agora.'}`,
    body,
  ].join('\n\n')
}

const STYLE = `<style>
  body { font-family: Arial; font-size: 11pt; line-height: 1.4; }
  h1 { font-size: 20pt; color: #1d1d1b; } h2 { font-size: 15pt; color: #2f5bea; }
  h3 { font-size: 12pt; } h4 { font-size: 11pt; }
  pre, code { font-family: 'Courier New'; font-size: 10pt; background: #f3f3f3; }
</style>`

/** Monta e envia o documento do curso. Cria na primeira vez; depois substitui o conteúdo. */
export async function updateCourseDoc(course: string) {
  const [transcripts, summaries, meta, docs] = await Promise.all([
    getItem('transcripts'),
    getItem('summaries'),
    getItem('lessonMeta'),
    getItem('courseDocs'),
  ])

  const lessons: Lesson[] = Object.entries(transcripts)
    .filter(([url, t]) => (t.course || 'Sem curso') === course && summaries[url]?.status === 'done')
    .map(([url, t]) => {
      const { title, sections } = parseLesson(summaries[url].markdown ?? '')
      return { url, title: title || t.title, module: meta[url]?.module || NO_MODULE, createdAt: t.createdAt, sections }
    })
  if (!lessons.length) throw new Error('Nenhuma aula deste curso tem material de estudo ainda.')

  const html = `<html><head><meta charset="utf-8">${STYLE}</head><body>${await marked.parse(buildCourseMarkdown(course, lessons))}</body></html>`

  const rootId = await ensureFolder(ROOT_FOLDER)
  const folderId = await ensureFolder(course, rootId)
  const current = docs[course]
  const fileId = current && (await docExists(current.id)) ? current.id : undefined
  const doc = await upsertDocFromHtml({ title: `${course} · Material de estudo`, html, folderId, fileId })

  await setRecord('courseDocs', course, { id: doc.id, url: doc.webViewLink, updatedAt: Date.now() })
  return doc
}
