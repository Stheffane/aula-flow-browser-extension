/** Duração de cada trecho: o texto aparece rápido e cada envio fica bem abaixo do limite de 25 MB. */
export const SEGMENT_MS = 3 * 60 * 1000

/**
 * Grava um stream de áudio em trechos independentes (cada um é um arquivo .webm válido).
 * `onSegment` é chamado em ordem; `stop()` só resolve depois do último trecho entregue.
 */
export function recordInSegments(stream: MediaStream, onSegment: (audio: Blob) => Promise<void> | void) {
  let current: MediaRecorder
  let delivered: Promise<void> = Promise.resolve()
  let lastStopped: Promise<void> = Promise.resolve()

  function startOne() {
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    lastStopped = new Promise((resolve) => {
      rec.onstop = () => {
        const audio = new Blob(chunks, { type: 'audio/webm' })
        delivered = delivered.then(() => onSegment(audio))
        resolve()
      }
    })
    rec.start()
    current = rec
  }

  startOne()
  const timer = setInterval(() => {
    current.stop()
    startOne()
  }, SEGMENT_MS)

  return {
    async stop() {
      clearInterval(timer)
      if (current.state !== 'inactive') current.stop()
      await lastStopped
      await delivered
    },
  }
}

/** Mensagens da extensão só levam JSON, então o áudio vai como data URL. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
