import { createHash } from 'crypto'
import { extname, join } from 'path'
import { mkdirSync } from 'fs'
import { readFile } from 'fs/promises'
import sharp from 'sharp'
import heicDecode from 'heic-decode'

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
    const ext = extname(filePath).toLowerCase()
    // HEIC/HEIF：sharp（libvips）不带 libheif，用 libheif wasm 解码后交给 sharp 压缩
    if (ext === '.heic' || ext === '.heif') {
      return await generateThumbHeic(filePath, thumbPath)
    }
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

async function generateThumbHeic(filePath: string, thumbPath: string): Promise<ThumbResult> {
  try {
    const buffer = await readFile(filePath)
    const decoded = await heicDecode({ buffer })
    await sharp(decoded.data, {
      raw: { width: decoded.width, height: decoded.height, channels: 4 }
    })
      .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toFile(join(thumbsDir, thumbPath))
    return { thumbPath, width: decoded.width, height: decoded.height }
  } catch (e) {
    console.error('[thumbs:heic]', filePath, e)
    return { thumbPath: null, width: null, height: null }
  }
}
