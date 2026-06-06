import { createWorker } from 'tesseract.js'

export type OcrProgressCallback = (progress: number, statusText: string) => void

/**
 * OCR the given image (as a data URL) and return the extracted text.
 *
 * Uses Tesseract.js with English (`eng`) language data.
 * On first run the browser downloads ~4 MB of language data from jsDelivr CDN
 * and caches it; subsequent calls are fast.
 *
 * @param imageDataUrl  data-URL produced by FileReader.readAsDataURL().
 * @param onProgress    Optional callback receiving a 0–1 progress value and
 *                      a human-readable status string.
 */
export async function recognizeText(
  imageDataUrl: string,
  onProgress?: OcrProgressCallback,
): Promise<string> {
  const worker = await createWorker('eng', 1, {
    logger(m: { progress: number; status: string }) {
      if (!onProgress) return
      const { status, progress: p } = m
      if (status === 'recognizing text') {
        onProgress(0.5 + p * 0.5, 'テキストを認識中…')
      } else if (status.startsWith('load')) {
        onProgress(p * 0.3, 'モデルを読み込み中…')
      } else if (status.startsWith('initializ')) {
        onProgress(0.3 + p * 0.2, '初期化中…')
      }
    },
  })

  try {
    const {
      data: { text },
    } = await worker.recognize(imageDataUrl)
    onProgress?.(1, '完了')
    return text
  } finally {
    await worker.terminate()
  }
}
