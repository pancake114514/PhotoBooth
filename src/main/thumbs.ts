import { createHash } from 'crypto'
import { extname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { readFile } from 'fs/promises'
import sharp from 'sharp'
import heicDecode from 'heic-decode'

let thumbsDir = ''
let previewsDir = ''

/** 在应用数据目录下创建缩略图 / 大图预览缓存目录 */
export function initThumbs(baseDir: string): void {
  thumbsDir = join(baseDir, 'thumbs')
  previewsDir = join(baseDir, 'previews')
  mkdirSync(thumbsDir, { recursive: true })
  mkdirSync(previewsDir, { recursive: true })
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

const PREVIEW_SIZE = 2560

/** 进行中的预览图生成任务（防止同一文件并发重复转码） */
const previewTasks = new Map<string, Promise<string | null>>()

/**
 * 为 HEIC/HEIF 原图生成一张大图预览 JPEG（最长边 PREVIEW_SIZE），供大图预览使用。
 * Chromium 的 <img> 无法解码 HEIC，必须先转码。
 * 结果缓存到应用数据目录 previews/，返回缓存文件绝对路径；失败返回 null。
 */
export function getPreviewPath(filePath: string): Promise<string | null> {
  const key = thumbFileName(filePath) // sha1(路径) 与缩略图同源，保证唯一
  const cached = join(previewsDir, key)
  if (existsSync(cached)) return Promise.resolve(cached)
  const running = previewTasks.get(key)
  if (running) return running

  const task = (async (): Promise<string | null> => {
    try {
      const buffer = await readFile(filePath)
      const decoded = await heicDecode({ buffer })
      await sharp(decoded.data, {
        raw: { width: decoded.width, height: decoded.height, channels: 4 }
      })
        .rotate()
        .resize({ width: PREVIEW_SIZE, height: PREVIEW_SIZE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(cached)
      return cached
    } catch (e) {
      console.error('[preview:heic]', filePath, e)
      return null
    } finally {
      previewTasks.delete(key)
    }
  })()
  previewTasks.set(key, task)
  return task
}
