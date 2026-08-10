import { app, net, protocol } from 'electron'
import { basename, isAbsolute, join } from 'path'
import { pathToFileURL } from 'url'
import { existsSync } from 'fs'

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
  protocol.handle('thumbs', (req) => {
    const name = basename(new URL(req.url).pathname) // basename 消毒，防目录穿越
    return net.fetch(pathToFileURL(join(thumbsDir, name)).toString())
  })

  // photo://local/?p=<encodeURIComponent(绝对路径)> —— 原图（含浏览器可解码的 HEIC）
  protocol.handle('photo', (req) => {
    const p = new URL(req.url).searchParams.get('p') ?? ''
    if (!isAbsolute(p) || !existsSync(p)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(p).toString())
  })
}
