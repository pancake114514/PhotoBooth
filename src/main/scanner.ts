import { basename, extname, join } from 'path'
import { readdir, stat } from 'fs/promises'
import { BrowserWindow } from 'electron'
import { parseExif } from './exif'
import { generateThumb } from './thumbs'
import { getExistingRecords, scanBegin, scanEnd, scanMark, upsertPhoto } from './db'
import type { ScanProgress } from '../shared/types'

const IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.avif',
  '.heic',
  '.heif',
  '.bmp',
  '.tif',
  '.tiff'
])

const SKIP_DIRS = new Set(['node_modules', '.git', '$RECYCLE.BIN'])

function isImage(file: string): boolean {
  return IMAGE_EXTS.has(extname(file).toLowerCase())
}

function sendProgress(p: ScanProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('scan:progress', p)
  }
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return // 无权限等目录错误：跳过
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
      await walk(full, out)
    } else if (e.isFile() && isImage(e.name)) {
      out.push(full)
    }
  }
}

/** 并发池：最多 limit 个任务同时执行 */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++
      await fn(items[i])
    }
  })
  await Promise.all(workers)
}

const scanningFolders = new Set<number>()

export async function scanFolder(folderId: number, dir: string): Promise<void> {
  if (scanningFolders.has(folderId)) return // 防止重复扫描同一文件夹
  scanningFolders.add(folderId)
  let done = 0
  try {
    sendProgress({ folderId, phase: 'walking', done: 0, total: 0 })
    const files: string[] = []
    await walk(dir, files)
    const total = files.length

    scanBegin(folderId)
    sendProgress({ folderId, phase: 'processing', done: 0, total })

    // 增量扫描：已存在且 mtime/size 未变化的文件跳过 EXIF/缩略图处理
    const existing = getExistingRecords(folderId)
    let skipped = 0

    await mapLimit(files, 4, async (filePath) => {
      try {
        const st = await stat(filePath)
        const mtime = Math.floor(st.mtimeMs)
        const prev = existing.get(filePath)
        if (prev && prev.mtime === mtime && prev.size === st.size) {
          skipped++
          scanMark(folderId, filePath) // 保持记录存在，不重新解析
        } else {
          const exif = await parseExif(filePath)
          const { thumbPath, width, height } = await generateThumb(filePath)
          upsertPhoto({
            folderId,
            path: filePath,
            filename: basename(filePath),
            size: st.size,
            mtime,
            width,
            height,
            format: extname(filePath).slice(1).toLowerCase(),
            thumbPath,
            takenAt: exif.takenAt,
            make: exif.make,
            model: exif.model,
            lens: exif.lens,
            fnumber: exif.fnumber,
            iso: exif.iso,
            exposure: exif.exposure,
            focalLength: exif.focalLength,
            gpsLat: exif.gpsLat,
            gpsLng: exif.gpsLng,
            gpsAlt: exif.gpsAlt
          })
          scanMark(folderId, filePath)
        }
      } catch {
        // 单文件失败（扫描中被移动/删除等）：跳过
      }
      done++
      if (done % 5 === 0 || done === total) {
        sendProgress({ folderId, phase: 'processing', done, total })
      }
    })

    scanEnd(folderId)
    sendProgress({
      folderId,
      phase: 'done',
      done: total,
      total,
      message: skipped > 0 ? `跳过 ${skipped} 张未变化的照片` : undefined
    })
  } catch (e) {
    sendProgress({ folderId, phase: 'error', done, total: done, message: String(e) })
  } finally {
    scanningFolders.delete(folderId)
  }
}
