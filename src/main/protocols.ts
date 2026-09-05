import { app, net, protocol } from 'electron'
import { basename, extname, isAbsolute, join } from 'path'
import { pathToFileURL } from 'url'
import { existsSync } from 'fs'
import { findPathByThumbPath } from './db'
import { generateThumb, getPreviewPath } from './thumbs'
import { IMAGE_EXTS } from './scanner'

/** 必须在 app ready 之前调用 */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'thumbs', privileges: { stream: true, supportFetchAPI: true } },
    { scheme: 'photo', privileges: { stream: true, supportFetchAPI: true } }
  ])
}

/** app ready 之后调用 */
export function registerProtocols(): void {
  const thumbsDir = join(app.getPath('userData'), 'thumbs')

  // thumbs://thumb/<cacheFileName> —— 缩略图缓存文件
  // 缓存缺失（被清理/删除）时按需重新生成，避免前端裂图
  protocol.handle('thumbs', async (req) => {
    const name = basename(new URL(req.url).pathname) // basename 消毒，防目录穿越
    const file = join(thumbsDir, name)
    if (!existsSync(file)) {
      const orig = findPathByThumbPath(name)
      if (orig) {
        const res = await generateThumb(orig)
        if (res.thumbPath) return net.fetch(pathToFileURL(file).toString())
      }
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(file).toString())
  })

  // photo://local/?p=<encodeURIComponent(绝对路径)> —— 原图（含浏览器可解码的 HEIC）
  protocol.handle('photo', async (req) => {
    const p = new URL(req.url).searchParams.get('p') ?? ''
    if (!isAbsolute(p) || !existsSync(p)) {
      return new Response('Not found', { status: 404 })
    }
    // Chromium 的 <img> 无法解码 HEIC/HEIF，先转成 JPEG 预览；其余格式直接加载原图
    const ext = extname(p).toLowerCase()
    // 安全：仅允许受支持的图像格式通过 photo:// 访问，防止读取任意文件
    if (!IMAGE_EXTS.has(ext)) {
      return new Response('Forbidden', { status: 403 })
    }
    if (ext === '.heic' || ext === '.heif') {
      const preview = await getPreviewPath(p)
      if (preview) return net.fetch(pathToFileURL(preview).toString())
      // 转码失败时回退原图（浏览器大概率无法解码，但避免直接 404）
    }
    return net.fetch(pathToFileURL(p).toString())
  })
}
