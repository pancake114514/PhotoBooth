import { createHash } from 'crypto'
import { join } from 'path'
import { mkdirSync } from 'fs'
import sharp from 'sharp'

let thumbsDir = ''

/** 在应用数据目录下创建缩略图缓存目录 */
export function initThumbs(baseDir: string): void {
  thumbsDir = join(baseDir, 'thumbs')
  mkdirSync(thumbsDir, { recursive: true })
}

export function getThumbsDir(): string {
  return thumbsDir
}

export function thumbFileName(filePath: string): string {
  return createHash('sha1').update(filePath).digest('hex') + '.jpg'
}

export interface ThumbResult {
  /** 缓存文件名（相对缓存目录）；null 表示生成失败（如 HEIC 无 libheif 支持） */
  thumbPath: string | null
  width: number | null
  height: number | null
}

const THUMB_SIZE = 512

/** 生成 JPEG 缩略图；失败（格式不支持等）时返回 null，由前端回退到原图加载 */
export async function generateThumb(filePath: string): Promise<ThumbResult> {
  const thumbPath = thumbFileName(filePath)
  try {
    const img = sharp(filePath, { failOn: 'none', limitInputPixels: 268_435_456 }).rotate()
    const meta = await img.metadata()
    await img
      .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toFile(join(thumbsDir, thumbPath))
    return { thumbPath, width: meta.width ?? null, height: meta.height ?? null }
  } catch {
    return { thumbPath: null, width: null, height: null }
  }
}
