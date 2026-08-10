import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Api } from '../shared/types'

const api: Api = {
  folders: {
    list: () => ipcRenderer.invoke('folders:list'),
    add: () => ipcRenderer.invoke('folders:add'),
    remove: (id: number) => ipcRenderer.invoke('folders:remove', id),
    rescan: (id: number) => ipcRenderer.invoke('folders:rescan', id)
  },
  photos: {
    list: (folderId: number, offset: number, limit: number, opts?) =>
      ipcRenderer.invoke('photos:list', folderId, offset, limit, opts),
    gpsList: (folderId: number, opts?) =>
      ipcRenderer.invoke('photos:gpsList', folderId, opts),
    setRating: (id: number, rating: number) =>
      ipcRenderer.invoke('photos:setRating', id, rating),
    setFavorite: (id: number, favorite: boolean) =>
      ipcRenderer.invoke('photos:setFavorite', id, favorite)
  },
  thumbUrl: (thumbPath: string) => `thumbs://thumb/${thumbPath}`,
  photoUrl: (path: string) => `photo://local/?p=${encodeURIComponent(path)}`,
  onScanProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, p: Parameters<typeof cb>[0]): void => cb(p)
    ipcRenderer.on('scan:progress', listener)
    return () => {
      ipcRenderer.removeListener('scan:progress', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
