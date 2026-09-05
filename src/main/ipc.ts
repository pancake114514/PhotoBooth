import { basename, extname } from 'path'
import { BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, shell } from 'electron'
import type { NativeImage } from 'electron'
import * as db from './db'
import { scanFolder, cancelScan } from './scanner'
import { removeCacheFiles } from './thumbs'
import { IMAGE_EXTS } from './scanner'
import type { PhotoListOptions } from '../shared/types'

/** 校验 IPC 发送方来源，防止非应用页面的调用 */
function assertSender(e: Electron.IpcMainInvokeEvent): void {
  const url = e.senderFrame?.url
  if (!url) return
  try {
    const u = new URL(url)
    // 允许 file:// （生产）和 localhost （开发服务器）
    if (u.protocol === 'file:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1') return
  } catch {
    // 非法 URL：阻止
  }
  throw new Error('Unauthorized IPC sender')
}

/** 安全包装：校验发送方后执行 handler */
function safeHandle(
  channel: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (e: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown
): void {
  ipcMain.handle(channel, async (e, ...args) => {
    assertSender(e)
    return handler(e, ...args)
  })
}

/**
 * 读取图片并应用 EXIF 方向，产出可写入剪贴板的 nativeImage。
 * 用 sharp .rotate() 自动应用 Orientation 标签（否则手机竖拍图方向错误），
 * 转 PNG 后给 nativeImage；sharp 无法解码的格式（如 HEIC）回退到原生读取。
 */
async function createOrientedImage(path: string): Promise<NativeImage | null> {
  const ext = extname(path).toLowerCase()
  const isSharpFormat = IMAGE_EXTS.has(ext) && ext !== '.heic' && ext !== '.heif'
  try {
    if (isSharpFormat) {
      const sharp = (await import('sharp')).default
      const png = await sharp(path, { failOn: 'none' }).rotate().png().toBuffer()
      const img = nativeImage.createFromBuffer(png)
      if (!img.isEmpty()) return img
    }
    // 回退：sharp 不支持的格式（HEIC 等）或转码失败，直接用原生读取（方向可能未应用）
    const img = nativeImage.createFromPath(path)
    return img.isEmpty() ? null : img
  } catch {
    return null
  }
}

export function registerIpc(): void {
  safeHandle('folders:list', () => db.listFolders())

  safeHandle('folders:add', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const res = await dialog.showOpenDialog(win, {
      title: '选择照片文件夹',
      properties: ['openDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const dir = res.filePaths[0]
    const folder = db.addFolder(dir, basename(dir))
    void scanFolder(folder.id, folder.path) // 添加后自动开始扫描
    return folder
  })

  safeHandle('folders:remove', async (_e, id: number) => {
    const folder = db.getFolder(id)
    if (!folder) return
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const res = await dialog.showMessageBox(win, {
      type: 'warning',
      title: '移除相册',
      message: `确定要移除「${folder.name}」吗？`,
      detail: `将从应用中删除 ${folder.photoCount} 张照片的索引（含评分和收藏数据），但不会删除磁盘上的照片文件。\n\n误移除后重新添加同一文件夹即可恢复照片，但评分和收藏数据无法找回。`,
      buttons: ['移除', '取消'],
      defaultId: 1,
      cancelId: 1
    })
    if (res.response !== 0) return
    const removed = db.removeFolder(id)
    if (removed.length > 0) removeCacheFiles(removed)
  })

  safeHandle('folders:rescan', (_e, id: number) => {
    const folder = db.getFolder(id)
    if (folder) void scanFolder(folder.id, folder.path)
  })

  safeHandle('folders:cancelScan', (_e, id: number) => {
    cancelScan(id)
  })

  safeHandle('folders:context-menu', (e, path: string, x: number, y: number) => {
    const menu = Menu.buildFromTemplate([
      {
        label: '在资源管理器中打开',
        click: () => {
          void shell.openPath(path).then((err) => {
            if (err) console.error('[open-folder]', path, err)
          })
        }
      }
    ])
    menu.popup({
      window: BrowserWindow.fromWebContents(e.sender) ?? undefined,
      x: Math.round(x),
      y: Math.round(y)
    })
  })

  safeHandle(
    'photos:list',
    (_e, folderId: number, offset: number, limit: number, opts: PhotoListOptions = {}) =>
      db.listPhotos(folderId, offset, limit, opts)
  )

  safeHandle('photos:gpsList', (_e, folderId: number, opts: PhotoListOptions = {}) =>
    db.listGpsPhotos(folderId, opts)
  )

  safeHandle('photos:setRating', (_e, id: number, rating: number) => {
    db.updateRating(id, rating)
  })

  safeHandle('photos:setFavorite', (_e, id: number, favorite: boolean) => {
    db.updateFavorite(id, favorite)
  })

  safeHandle('photos:context-menu', (e, path: string, x: number, y: number) => {
    const menu = Menu.buildFromTemplate([
      {
        label: '在资源管理器中打开',
        click: () => {
          shell.showItemInFolder(path)
        }
      },
      {
        label: '用系统图片浏览器打开',
        click: () => {
          void shell.openPath(path).then((err) => {
            if (err) console.error('[open-photo]', path, err)
          })
        }
      },
      {
        type: 'separator'
      },
      {
        label: '复制图片',
        click: () => {
          void createOrientedImage(path).then((img) => {
            if (img) {
              clipboard.writeImage(img)
            } else {
              dialog.showErrorBox('复制图片失败', '无法读取图片文件：\n' + path)
            }
          })
        }
      },
      {
        label: '复制文件路径',
        click: () => {
          clipboard.writeText(path)
        }
      }
    ])
    menu.popup({
      window: BrowserWindow.fromWebContents(e.sender) ?? undefined,
      x: Math.round(x),
      y: Math.round(y)
    })
  })

  // 复制图片到系统剪贴板（应用 EXIF 方向）；失败不抛错，返回 ok=false 由渲染层提示
  safeHandle('clipboard:copyImage', async (_e, path: string) => {
    try {
      const img = await createOrientedImage(path)
      if (!img) {
        throw new Error('无法读取图片文件')
      }
      clipboard.writeImage(img)
      return { ok: true }
    } catch (err) {
      console.error('[copyImage]', path, err)
      return { ok: false }
    }
  })

  // 切换窗口全屏
  safeHandle('window:toggleFullscreen', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    const newState = !win.isFullScreen()
    win.setFullScreen(newState)
    return newState
  })
}
