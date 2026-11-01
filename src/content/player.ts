import { blobToDataUrl, recordInSegments } from '../shared/recorder'
import type { Message } from '../shared/types'

// Roda dentro do iframe do player (Mediastream e afins): controla o <video> e grava o áudio dele.
const send = (msg: Message) => chrome.runtime.sendMessage(msg)
const watched = new WeakSet<HTMLVideoElement>()
let recording: ReturnType<typeof recordInSegments> | null = null
let lastStatus = 0

function watch(video: HTMLVideoElement) {
  if (watched.has(video)) return
  watched.add(video)

  video.addEventListener('ended', async () => {
    await stopRecording()
    send({ type: 'PLAYER_ENDED' })
  })
  video.addEventListener('timeupdate', () => {
    if (Date.now() - lastStatus < 3000) return
    lastStatus = Date.now()
    send({ type: 'PLAYER_STATUS', currentTime: video.currentTime, duration: video.duration })
  })
}

/** Começa a gravar o áudio do próprio vídeo (sem captura da aba, sem permissão extra). */
function startRecording(video: HTMLVideoElement) {
  const captured = (video as HTMLVideoElement & { captureStream(): MediaStream }).captureStream()
  const tracks = captured.getAudioTracks()
  if (!tracks.length) throw new Error('O vídeo não tem trilha de áudio para gravar.')
  recording = recordInSegments(new MediaStream(tracks), async (audio) => {
    send({ type: 'AUDIO_SEGMENT', dataUrl: await blobToDataUrl(audio) })
  })
}

async function stopRecording() {
  if (!recording) return
  const current = recording
  recording = null
  await current.stop()
  send({ type: 'CAPTURE_FINISHED' })
}

async function play(video: HTMLVideoElement, rate: number) {
  watch(video)
  video.currentTime = 0
  video.muted = false
  video.playbackRate = rate
  try {
    await video.play()
    return true
  } catch {
    return false // bloqueado pelo navegador: precisa de um clique no play
  }
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  const video = document.querySelector('video')
  if (!video) return // outro frame responde

  if (msg.type === 'PLAYER_RECORD') {
    play(video, msg.rate).then((playing) => {
      try {
        if (playing) startRecording(video)
        else {
          // Começa a gravar assim que você clicar no play.
          video.addEventListener(
            'playing',
            () => {
              try {
                startRecording(video)
              } catch (e) {
                send({ type: 'CAPTURE_FAILED', error: String(e) })
              }
            },
            { once: true },
          )
        }
        sendResponse({ ok: true, needsClick: !playing })
      } catch (e) {
        video.pause()
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    })
    return true // resposta assíncrona
  }

  if (msg.type === 'PLAYER_START') {
    play(video, msg.rate).then((playing) => sendResponse({ ok: true, needsClick: !playing }))
    return true
  }

  if (msg.type === 'PLAYER_PAUSE') {
    video.pause()
    stopRecording()
    sendResponse({ ok: true })
  }
})
