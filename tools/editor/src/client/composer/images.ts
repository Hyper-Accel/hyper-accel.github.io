import { MAX_IMAGE_BYTES } from "../../document/codec"
import type { BundleImage } from "../../shared/onsite/document"

const QUALITY_STEPS = [0.92, 0.85, 0.75, 0.65] as const
const SCALE_STEP = 0.8
const MIN_EDGE = 64

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  return canvas
}

async function canvasToWebP(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/webp", quality })
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("WebP 인코딩에 실패했습니다."))),
      "image/webp",
      quality,
    )
  })
}

async function drawWebP(bitmap: ImageBitmap, scale: number, quality: number): Promise<Blob> {
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = createCanvas(width, height)
  const context = canvas.getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null
  if (!context) throw new Error("캔버스를 만들 수 없습니다.")
  context.drawImage(bitmap, 0, 0, width, height)
  const blob = await canvasToWebP(canvas, quality)
  if (blob.type !== "image/webp") throw new Error("이 브라우저는 WebP 인코딩을 지원하지 않습니다.")
  return blob
}

export async function encodeWebP(file: Blob, limit = MAX_IMAGE_BYTES): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    let scale = 1
    // The picture is always tried at its own size first: a small one (an icon) is never too big.
    do {
      for (const quality of QUALITY_STEPS) {
        const blob = await drawWebP(bitmap, scale, quality)
        if (blob.size <= limit) return blob
      }
      scale *= SCALE_STEP
    } while (Math.min(bitmap.width, bitmap.height) * scale >= MIN_EDGE)
    throw new Error(`이미지를 ${limit.toLocaleString("en-US")}바이트 이하로 줄이지 못했습니다.`)
  } finally {
    bitmap.close()
  }
}

export function pendingImageName(now: Date, suffix = crypto.randomUUID().slice(0, 6)): string {
  const compact = now.toISOString().replace(/\D/g, "").slice(0, 14)
  return `images/pasted-${compact.slice(0, 8)}-${compact.slice(8)}-${suffix}.webp`
}

export async function pendingImageFromFile(
  file: Blob,
  path: string,
): Promise<Extract<BundleImage, { status: "pending" }>> {
  const blob = await encodeWebP(file)
  return { status: "pending", path, blob, mime: "image/webp" }
}
