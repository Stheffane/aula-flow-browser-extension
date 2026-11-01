import { blobToDataUrl, recordInSegments } from '../shared/recorder'
import type { Message } from '../shared/types'

/**
 * Plano B: grava o áudio da aba inteira (chrome.tabCapture), para players em que não
 * dá para gravar direto do <video>. Os trechos vão para o background, que transcreve.
 * Offscreen só tem acesso a chrome.runtime.
 */
const send = (msg: Message) => chrome.runtime.sendMessage(msg)

let stream: MediaStream | null = null
let audioCtx: AudioContext | null = null
let recording: ReturnType<typeof recordInSegments> | null = null

async function start(streamId: string) {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as MediaTrackConstraints,
    video: false,
  })
  // Capturar a aba silencia o som dela; reproduzimos de volta para você continuar ouvindo.
  audioCtx = new AudioContext()
  audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination)
  recording = recordInSegments(stream, async (audio) => send({ type: 'AUDIO_SEGMENT', dataUrl: await blobToDataUrl(audio) }))
}

async function stop() {
  if (!recording) return
  const current = recording
  recording = null
  await current.stop()
  stream?.getTracks().forEach((t) => t.stop())
  await audioCtx?.close()
  stream = null
  audioCtx = null
  send({ type: 'CAPTURE_FINISHED' })
}

chrome.runtime.onMessage.addListener((msg: Message) => {
  if (msg.type === 'OFFSCREEN_START') start(msg.streamId).catch((e) => send({ type: 'CAPTURE_FAILED', error: String(e) }))
  if (msg.type === 'CAPTURE_STOP' || msg.type === 'PLAYER_ENDED') stop()
})
