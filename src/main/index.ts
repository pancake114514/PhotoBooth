import { app, shell, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerSchemes, registerProtocols } from './protocols'
import { closeDb, initDb } from './db'
import { initThumbs } from './thumbs'
import { registerIpc } from './ipc'

registerSchemes()

// 高德/卫星瓦片服务器对 TLS 1.3 握手存在兼容性问题（ERR_CONNECTION_CLOSED），
// 强制使用 TLS 1.2 以绕过握手失败
app.commandLine.appendSwitch('ssl-version-max', 'tls1.2')
// 若系统配置了代理（翻墙），国内瓦片域名可能被错误地走代理导致握手失败，
// 让 autonavi.com 直连绕过代理
app.commandLine.appendSwitch('proxy-bypass-list', '<local>;*.is.autonavi.com;*.autonavi.com')

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.photobooth')

  // 高德/卫星瓦片防盗链：为 autonavi.com 的瓦片请求设置 Referer，避免 403
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.is.autonavi.com/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://www.amap.com/'
      callback({ requestHeaders: details.requestHeaders })
    }
  )

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDb(join(app.getPath('userData'), 'photobooth.db'))
  initThumbs(app.getPath('userData'))
  registerProtocols()
  registerIpc()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  closeDb()
})
