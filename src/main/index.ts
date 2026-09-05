import { app, shell, BrowserWindow, Menu } from 'electron'
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

// 单实例锁：第二实例激活已有窗口后退出
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    // 最小宽度：收起侧边栏(40) + 分隔条(6) + 主区容纳 3 列缩略图(3×160 + 2×12 gap + 2×16 padding + 滚动条≈15 = 551)
    // 同时不小于展开侧边栏(200) + 主区 Panel minSize(400) 之和 606
    minWidth: 610,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 拦截刷新快捷键（所有模式）：Electron 应用内刷新页面无意义，
  // 还会丢失界面状态（缩放/翻页位置），开发模式误触 Ctrl+R 也会导致界面闪烁
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const key = input.key.toLowerCase()
    if (key === 'f5' || (input.control && key === 'r')) {
      event.preventDefault()
      return
    }
    // 生产模式：额外拦截 DevTools 快捷键（开发模式保留，便于调试）
    if (!is.dev) {
      const isDevTools =
        key === 'f12' ||
        ((input.control || input.alt) && input.shift && key === 'i') ||
        (input.control && input.shift && (key === 'j' || key === 'c'))
      if (isDevTools) {
        event.preventDefault()
      }
    }
  })

  // 生产模式：移除默认菜单（含 DevTools 入口）
  if (!is.dev) {
    Menu.setApplicationMenu(null)
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const u = new URL(details.url)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        void shell.openExternal(details.url)
      }
    } catch {
      // 非法 URL：忽略，不打开
    }
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

  // 第二实例启动时：聚焦已有窗口
  app.on('second-instance', () => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const win = windows[0]
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

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
