import { basename } from 'path'
import { BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, shell } from 'electron'
import * as db from './db'
import { scanFolder, cancelScan } from './scanner'
import { removeCacheFiles } from './thumbs'

export function registerIpc(): void {
  ipcMain.handle('folders:list', () => db.listFolders())

  ipcMain.handle('folders:add', async () => {
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

  ipcMain.handle('folders:remove', async (_e, id: number) => {
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

  ipcMain.handle('folders:rescan', (_e, id: number) => {
    const folder = db.getFolder(id)
    if (folder) void scanFolder(folder.id, folder.path)
  })

  ipcMain.handle('folders:cancelScan', (_e, id: number) => {
    cancelScan(id)
  })

  ipcMain.handle('folders:context-menu', (e, path: string, x: number, y: number) => {
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

  ipcMain.handle('photos:list', (_e, folderId: number, offset: number, limit: number, opts) =>
    db.listPhotos(folderId, offset, limit, opts)
  )

  ipcMain.handle('photos:gpsList', (_e, folderId: number, opts) => db.listGpsPhotos(folderId, opts))

  ipcMain.handle('photos:setRating', (_e, id: number, rating: number) => {
    db.updateRating(id, rating)
  })

  ipcMain.handle('photos:setFavorite', (_e, id: number, favorite: boolean) => {
    db.updateFavorite(id, favorite)
  })

  ipcMain.handle('photos:context-menu', (e, path: string, x: number, y: number) => {
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
      }
    ])
    menu.popup({
      window: BrowserWindow.fromWebContents(e.sender) ?? undefined,
      x: Math.round(x),
      y: Math.round(y)
    })
  })

  // 复制图片到系统剪贴板
  ipcMain.handle('clipboard:copyImage', async (_e, path: string) => {
    try {
      const img = nativeImage.createFromPath(path)
      if (img.isEmpty()) {
        throw new Error('无法读取图片文件')
      }
      clipboard.writeImage(img)
    } catch (err) {
      console.error('[copyImage]', path, err)
    }
  })

  // 复制文本到系统剪贴板
  ipcMain.handle('clipboard:copyText', (_e, text: string) => {
    clipboard.writeText(text)
  })

  // 切换窗口全屏
  ipcMain.handle('window:toggleFullscreen', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    const newState = !win.isFullScreen()
    win.setFullScreen(newState)
    return newState
  })
}
