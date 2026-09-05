import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerSchemes, registerProtocols } from './protocols'
import { closeDb, initDb } from './db'
import { initThumbs } from './thumbs'
import { registerIpc } from './ipc'

registerSchemes()

// 高德/卫星瓦片服务器对 TLS 1.3 握手存在兼容性问题（ERR_CONNECTION_CLOSED），
// 强制使用 TLS 1.2 以绕过握手失败。
// 注意：此开关全局生效，但本应用唯一的 HTTPS 连接仅有地图瓦片（通过 <img> 加载），
// 不影响其他功能。待高德修复 TLS 1.3 兼容后应移除此开关。
app.commandLine.appendSwitch('ssl-version-max', 'tls1.2')

// 单实例锁：第二实例激活已有窗口后退出
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// 窗口状态持久化：保存/恢复窗口尺寸和位置
const windowStateFile = join(app.getPath('userData'), 'window-state.json')

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

function loadWindowState(): WindowState | null {
  try {
    const data = JSON.parse(readFileSync(windowStateFile, 'utf-8')) as WindowState
    if (typeof data.width === 'number' && typeof data.height === 'number') return data
  } catch {
    // 文件不存在或解析失败：使用默认值
  }
  return null
}

function saveWindowState(win: BrowserWindow): void {
  const isMaximized = win.isMaximized()
  const bounds = isMaximized ? win.getNormalBounds() : win.getBounds()
  const state: WindowState = { ...bounds, isMaximized }
  try {
    writeFileSync(windowStateFile, JSON.stringify(state))
  } catch {
    // 写入失败：忽略，不影响正常使用
  }
}

function createWindow(): void {
  const saved = loadWindowState()
  const mainWindow = new BrowserWindow({
    width: saved?.width ?? 1280,
    height: saved?.height ?? 800,
    x: saved?.x,
    y: saved?.y,
    // 最小宽度：收起侧边栏(40) + 分隔条(6) + 主区容纳 3 列缩略图(3×160 + 2×12 gap + 2×16 padding + 滚动条≈15 = 551)
    // 同时不小于展开侧边栏(200) + 主区 Panel minSize(400) 之和 606
    minWidth: 610,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  // 恢复最大化状态
  if (saved?.isMaximized) {
    mainWindow.maximize()
  }

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

  // 窗口移动/调整大小时延迟保存状态
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveWindowState(mainWindow), 500)
  }
  mainWindow.on('resize', scheduleSave)
  mainWindow.on('move', scheduleSave)
  mainWindow.on('maximize', scheduleSave)
  mainWindow.on('unmaximize', scheduleSave)
  mainWindow.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveWindowState(mainWindow)
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
