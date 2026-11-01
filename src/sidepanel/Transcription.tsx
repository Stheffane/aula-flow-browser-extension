import { useEffect, useState } from 'react'
import { useStorage } from './useStorage'
import { askAllFrames, getActiveTab } from '../shared/tabs'
import type { LessonRef, Message } from '../shared/types'
import { PROVIDERS } from '../shared/transcription'

type PlayerReply = { ok: boolean; needsClick?: boolean; error?: string }

/** Envia ao background e transforma { ok: false } em erro. */
async function send(msg: Message) {
  const res = await chrome.runtime.sendMessage<Message, { ok: boolean; error?: string }>(msg)
  if (!res?.ok) throw new Error(res?.error ?? 'A extensão não respondeu.')
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Re-renderiza a cada segundo enquanto `active` for true (para o cronômetro). */
function useTick(active: boolean) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [active])
}

/** `lesson` é null quando a página atual não é uma videoaula. */
export function Transcription({ lesson }: { lesson: LessonRef | null }) {
  const [settings] = useStorage('settings')
  const [job] = useStorage('job')
  const [transcripts] = useStorage('transcripts')
  const [progress, setProgress] = useState<{ currentTime: number; duration: number } | null>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)

  const provider = settings.transcriptionProvider
  const apiKey = settings.apiKeys[provider]
  const transcript = lesson ? transcripts[lesson.url] : undefined
  const busy = job?.status === 'recording' || job?.status === 'transcribing'
  const isThisLesson = !!lesson && job?.lesson.url === lesson.url
  useTick(job?.status === 'recording')

  // Progresso do vídeo, enviado pelo script do player.
  useEffect(() => {
    const onMsg = (msg: Message) => {
      if (msg.type === 'PLAYER_STATUS') setProgress(msg)
    }
    chrome.runtime.onMessage.addListener(onMsg)
    return () => chrome.runtime.onMessage.removeListener(onMsg)
  }, [])

  async function start() {
    if (!lesson) return
    setError('')
    setStarting(true)
    setProgress(null)
    try {
      const tab = await getActiveTab()
      if (!tab?.id) throw new Error('Aba não encontrada.')
      // tabCapture exige o gesto do clique, então o streamId do plano B é pedido logo de cara.
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }).catch(() => null)

      await send({ type: 'JOB_START', lesson, transcriber: { provider, apiKey } })

      // 1º: grava direto do <video> (não precisa de permissão de captura).
      const replies = await askAllFrames<PlayerReply>(tab.id, { type: 'PLAYER_RECORD', rate: settings.playbackRate })
      const ok = replies.find((r) => r.ok)
      if (ok) {
        if (ok.needsClick) setError('O navegador bloqueou o play automático. Clique no play do vídeo para começar a gravar.')
        return
      }

      // 2º (plano B): grava o áudio da aba inteira.
      const reason = replies.find((r) => r.error)?.error ?? 'Nenhum player de vídeo respondeu.'
      if (!streamId) throw new Error(`${reason} E o Chrome não liberou a captura da aba: clique no ícone da extensão nesta aba e tente de novo.`)
      await send({ type: 'CAPTURE_REQUEST', streamId })
      const played = await askAllFrames<PlayerReply>(tab.id, { type: 'PLAYER_START', rate: settings.playbackRate })
      if (!played.some((r) => r.ok && !r.needsClick)) setError('Clique no play do vídeo: a gravação já está rodando.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      chrome.runtime.sendMessage({ type: 'CAPTURE_FAILED', error: msg } satisfies Message)
    } finally {
      setStarting(false)
    }
  }

  async function stop() {
    const tab = await getActiveTab()
    if (tab?.id) askAllFrames(tab.id, { type: 'PLAYER_PAUSE' })
    chrome.runtime.sendMessage({ type: 'CAPTURE_STOP' } satisfies Message)
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const hasDuration = progress && Number.isFinite(progress.duration) && progress.duration > 0

  return (
    <section className="card stack">
      <h3>Transcrição</h3>

      {/* Status da gravação: aparece em qualquer página, para não perder de vista */}
      {busy && job && (
        <div className={`status ${job.status}`}>
          <div className="row">
            <strong>
              {job.status === 'recording' ? (
                <>
                  <span className="dot" /> Gravando · {fmt((Date.now() - job.startedAt) / 1000)}
                </>
              ) : (
                'Transcrevendo o final…'
              )}
            </strong>
            <span className="small">
              {job.segmentsDone} trecho{job.segmentsDone === 1 ? '' : 's'} pronto{job.segmentsDone === 1 ? '' : 's'}
            </span>
          </div>
          <p className="small">{job.lesson.title}</p>
          {job.status === 'recording' && hasDuration && (
            <>
              <progress value={progress.currentTime} max={progress.duration} />
              <p className="small">
                Vídeo em {fmt(progress.currentTime)} de {fmt(progress.duration)}
              </p>
            </>
          )}
          {job.status === 'recording' && job.segmentsDone === 0 && (
            <p className="small muted">O primeiro trecho de texto aparece em cerca de 3 minutos.</p>
          )}
          {job.status === 'recording' && (
            <button className="secondary" onClick={stop}>
              Parar e transcrever o que foi gravado
            </button>
          )}
        </div>
      )}

      {/* Texto parcial, ao vivo */}
      {busy && job?.preview && (
        <div className="transcript">{job.preview}</div>
      )}

      {!busy && !lesson && (
        <p className="muted">Abra uma videoaula para transcrever. O botão aparece quando a página tem um vídeo.</p>
      )}

      {!busy && lesson && (
        <>
          {!apiKey && <p className="muted">Informe a chave da {PROVIDERS[provider].name} nas configurações.</p>}
          <button onClick={start} disabled={!apiKey || starting}>
            {starting ? 'Iniciando…' : transcript ? 'Transcrever de novo' : 'Transcrever aula'}
          </button>
          <p className="small muted">
            O vídeo volta para o início e toca em {settings.playbackRate}x enquanto o áudio é gravado. Apenas dar play no
            vídeo não inicia a transcrição.
          </p>
        </>
      )}

      {job?.status === 'error' && isThisLesson && <p className="error">Erro: {job.error}</p>}
      {error && <p className="error">{error}</p>}

      {!busy && transcript && (
        <details className="stack">
          <summary className="small" style={{ color: 'var(--ok)' }}>
            ✓ Transcrição pronta · {transcript.text.split(/\s+/).length} palavras (ver texto original)
          </summary>
          <button className="ghost" onClick={() => copy(transcript.text)}>
            {copied ? 'Copiado!' : 'Copiar transcrição'}
          </button>
          <div className="transcript">{transcript.text}</div>
        </details>
      )}
    </section>
  )
}
