import { createHash } from 'crypto'
import { extname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { readFile, readdir, stat, unlink } from 'fs/promises'
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
  // 启动时检查一次缓存容量，超限（>200MB）即按 LRU 清理最旧缓存
  void maybeCleanCache()
}

export function getThumbsDir(): string {
  return thumbsDir
}

// ---------- 缓存清理 ----------

/** 大图预览缓存容量上限：200MB（缩略图不做容量清理，仅孤儿清理） */
const CACHE_LIMIT = 200 * 1024 * 1024
/** 低于该水位即停止删除（留出余量，避免频繁触发清理） */
const CACHE_LOW_WATER = 180 * 1024 * 1024
/** 两次清理检查的最小间隔：避免每次生成缓存都全目录扫描 */
const CLEAN_INTERVAL = 30_000
let lastCleanAt = 0
let cleaning: Promise<void> | null = null

/**
 * 检查大图预览缓存总大小，超过上限时按 mtime 从旧到新删除文件，直到低于低水位。
 * 节流 + 单飞：最多 30s 检查一次，并发调用复用同一任务。
 */
function maybeCleanCache(): void {
  const now = Date.now()
  if (now - lastCleanAt < CLEAN_INTERVAL) return
  lastCleanAt = now
  if (cleaning) return
  cleaning = (async () => {
    try {
      const files: Array<{ path: string; size: number; mtime: number }> = []
      let total = 0
      let names: string[]
      try {
        names = await readdir(previewsDir)
      } catch {
        return // 目录不存在（尚未初始化）时跳过
      }
      for (const name of names) {
        const full = join(previewsDir, name)
        try {
          const st = await stat(full)
          if (!st.isFile()) continue
          files.push({ path: full, size: st.size, mtime: st.mtimeMs })
          total += st.size
        } catch {
          // 文件已被删除/占用：忽略
        }
      }
      if (total <= CACHE_LIMIT) return
      // LRU：按 mtime 升序（最旧的先删）
      files.sort((a, b) => a.mtime - b.mtime)
      let removed = 0
      for (const f of files) {
        if (total - removed <= CACHE_LOW_WATER) break
        try {
          await unlink(f.path)
          removed += f.size
        } catch {
          // 文件占用等删除失败：跳过继续
        }
      }
      if (removed > 0) {
        console.log(
          `[cache] 预览缓存超出 ${CACHE_LIMIT / 1024 / 1024}MB 上限，清理 ${Math.round(removed / 1024)}KB 最旧缓存`
        )
      }
    } finally {
      cleaning = null
    }
  })()
}

/**
 * 删除原文件对应的缓存（缩略图 + 大图预览）。
 * 用于照片被删除/移除文件夹后的孤儿清理：缩略图仅在原文件消失时清除。
 */
export function removeCacheFiles(filePaths: string[]): void {
  for (const p of filePaths) {
    const key = thumbFileName(p)
    // 缩略图缓存：sha1.jpg
    const thumb = join(thumbsDir, key)
    if (existsSync(thumb)) {
      unlink(thumb).catch(() => {
        // 删除失败（占用等）：忽略，下次扫描再清理
      })
    }
    // 预览缓存：旧版 sha1.jpg 与新版 sha1-pv.jpg 都清理
    for (const name of [key, previewFileName(p)]) {
      const f = join(previewsDir, name)
      if (existsSync(f)) {
        unlink(f).catch(() => {
          // 删除失败（占用等）：忽略，下次扫描再清理
        })
      }
    }
  }
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
/** 单张缩略图生成超时毫秒数：sharp 对损坏/极大文件可能挂起，超时后返回 null */
const THUMB_TIMEOUT = 30_000

/** 带超时的 Promise 包装 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
  ])
}

/** 生成 JPEG 缩略图；失败（格式不支持、超时等）时返回 null，由前端回退到原图加载 */
export async function generateThumb(filePath: string): Promise<ThumbResult> {
  const thumbPath = thumbFileName(filePath)
  try {
    const ext = extname(filePath).toLowerCase()
    // HEIC/HEIF：sharp（libvips）不带 libheif，用 libheif wasm 解码后交给 sharp 压缩
    if (ext === '.heic' || ext === '.heif') {
      return await withTimeout(generateThumbHeic(filePath, thumbPath), THUMB_TIMEOUT)
    }
    return await withTimeout(generateThumbStandard(filePath, thumbPath), THUMB_TIMEOUT)
  } catch {
    return { thumbPath: null, width: null, height: null }
  }
}

/** 常规格式缩略图生成（sharp 直接处理） */
async function generateThumbStandard(filePath: string, thumbPath: string): Promise<ThumbResult> {
  const img = sharp(filePath, { failOn: 'none', limitInputPixels: 268_435_456 }).rotate()
  const meta = await img.metadata()
  await img
    .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toFile(join(thumbsDir, thumbPath))
  maybeCleanCache()
  return { thumbPath, width: meta.width ?? null, height: meta.height ?? null }
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
    maybeCleanCache()
    return { thumbPath, width: decoded.width, height: decoded.height }
  } catch (e) {
    console.error('[thumbs:heic]', filePath, e)
    return { thumbPath: null, width: null, height: null }
  }
}

/** 进行中的预览图生成任务（防止同一文件并发重复转码） */
const previewTasks = new Map<string, Promise<string | null>>()

/** 预览缓存文件名（带版本后缀，避免旧版降采样缓存被误用） */
function previewFileName(filePath: string): string {
  return thumbFileName(filePath).replace(/\.jpg$/, '-pv.jpg')
}

/**
 * 为 HEIC/HEIF 原图生成全分辨率 JPEG 预览，供大图预览使用。
 * Chromium 的 <img> 无法解码 HEIC，必须先转码；其余格式由 photo:// 直接加载原图。
 * 结果缓存到应用数据目录 previews/，返回缓存文件绝对路径；失败返回 null。
 */
export function getPreviewPath(filePath: string): Promise<string | null> {
  const key = previewFileName(filePath)
  const cached = join(previewsDir, key)
  if (existsSync(cached)) return Promise.resolve(cached)
  const running = previewTasks.get(key)
  if (running) return running

  const task = (async (): Promise<string | null> => {
    try {
      const buffer = await readFile(filePath)
      const decoded = await heicDecode({ buffer })
      // 全分辨率输出（不降采样），与 JPG 原图浏览一致
      await sharp(decoded.data, {
        raw: { width: decoded.width, height: decoded.height, channels: 4 }
      })
        .rotate()
        .jpeg({ quality: 85 })
        .toFile(cached)
      maybeCleanCache()
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
