import { basename } from 'path'
import { BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import * as db from './db'
import { scanFolder } from './scanner'

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

  ipcMain.handle('folders:remove', (_e, id: number) => {
    db.removeFolder(id)
  })

  ipcMain.handle('folders:rescan', (_e, id: number) => {
    const folder = db.getFolder(id)
    if (folder) void scanFolder(folder.id, folder.path)
  })

  ipcMain.handle('photos:list', (_e, folderId: number, offset: number, limit: number, opts) =>
    db.listPhotos(folderId, offset, limit, opts)
  )

  ipcMain.handle('photos:gpsList', (_e, folderId: number, opts) =>
    db.listGpsPhotos(folderId, opts)
  )

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
}
