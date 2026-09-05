# Photobooth 漏洞修复交接文档

> **生成日期**：2026-09-05
> **项目版本**：1.0.1
> **审查范围**：`src/` 全部源码 + 配置文件
> **上下文**：第二轮代码审查（上一轮高危项已全部修复并验证通过）

---

## 一、当前状态

### 已修复（上轮，本轮验证通过）

| 原编号 | 问题                          | 修复位置                                              |
| ------ | ----------------------------- | ----------------------------------------------------- |
| 2.1    | 移除文件夹无确认对话框        | `src/main/ipc.ts:48-64`                               |
| 2.3    | 扫描超大文件夹无取消机制      | `src/main/scanner.ts`（`cancelFlags` / `cancelScan`） |
| 2.4    | EXIF 解析无超时控制           | `src/main/exif.ts:81-98`（`EXIF_TIMEOUT`）            |
| 2.5    | sharp 图像处理无超时控制      | `src/main/thumbs.ts:129-138`（`withTimeout`）         |
| 2.18   | `photo://` 协议无扩展名白名单 | `src/main/protocols.ts:46-48`                         |
| 2.19   | `thumbs://` 缓存重建无去重    | `src/main/thumbs.ts:141`（`thumbTasks` Map）          |
| 2.28   | SQLite 外键级联未启用         | `src/main/db.ts:55`（`foreign_keys = ON`）            |

### 本轮新发现（待修复）

| 编号 | 严重性 | 领域     | 问题                                                 | 文件                          |
| ---- | ------ | -------- | ---------------------------------------------------- | ----------------------------- |
| F1   | **中** | 安全     | `shell.openExternal` 未校验 URL 协议                 | `src/main/index.ts:62-65`     |
| F2   | 低     | 代码质量 | CRLF 行尾不一致（271 条 prettier 警告）              | 10 个源文件                   |
| F3   | 低     | 冗余     | `createOrientedImage` 扩展名列表与 `IMAGE_EXTS` 重复 | `src/main/ipc.ts:13-16`       |
| F4   | 低     | 性能     | `existsSync` 在异步扫描循环中阻塞事件循环            | `src/main/scanner.ts:109-110` |
| F5   | 低     | 健壮性   | 无单实例锁，多开存在 DB/缓存竞争                     | `src/main/index.ts`           |

---

## 二、修复计划（按优先级排序）

### F1 【中-安全】`shell.openExternal` 未校验 URL 协议

**风险**：渲染进程触发 `window.open` 时，若 URL 使用非 http/https 协议（`file://`、`smb://`、`vbscript:` 等），可被用于启动本地程序或访问本地资源。当前 CSP 限制了 `script-src` 且 UI 无外链，但这是纵深防御应堵的口子。

**修复文件**：`src/main/index.ts`

**修复步骤**：

1. 定位 `createWindow()` 内的 `setWindowOpenHandler`（约第 62-65 行）：

```typescript
// 修改前
mainWindow.webContents.setWindowOpenHandler((details) => {
  shell.openExternal(details.url)
  return { action: 'deny' }
})
```

2. 替换为带协议校验的版本：

```typescript
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
```

3. 无需新增 import（`shell` 已在文件顶部引入）。

**验证**：`npm run typecheck` 通过；在 dev 模式下检查控制台无报错。

---

### F2 【低-代码质量】CRLF 行尾不一致

**现状**：`.editorconfig`（`end_of_line = lf`）与 `.gitattributes`（`* text=auto eol=lf`）均要求 LF，但因 `git config core.autocrlf = true`，工作区中 10 个文件仍为 CRLF，导致 `npm run lint` 输出 271 条 `Delete ␍` 警告。

**受影响文件**：

- `src/renderer/src/utils/format.ts`
- `src/renderer/src/main.tsx`
- `src/renderer/src/components/RatingStars.tsx`
- `src/renderer/src/components/PhotoGrid.tsx`
- `src/main/ipc.ts`
- `src/main/protocols.ts`
- `src/preload/global.d.ts`
- `src/renderer/src/env.d.ts`
- `eslint.config.mjs`
- `electron.vite.config.ts`

**修复步骤**（二选一）：

**方案 A（推荐，一次性）**：

```bash
npx prettier --write .
git add -A
git commit -m "style: 统一行尾为 LF"
```

**方案 B（git 规范化）**：

```bash
git add --renormalize .
git commit -m "style: 规范化行尾（renormalize）"
```

**验证**：`npm run lint` 输出 0 警告。

---

### F3 【低-冗余】`createOrientedImage` 扩展名列表与 `IMAGE_EXTS` 重复

**现状**：`src/main/ipc.ts:13-16` 硬编码了一个扩展名列表，与 `scanner.ts` 的 `IMAGE_EXTS`（仅少 `.heic`/`.heif`）内容重复。未来新增格式需同步两处。

**修复文件**：`src/main/ipc.ts`

**修复步骤**：

1. 在文件顶部补充 import（`IMAGE_EXTS` 已从 `./scanner` 导出）：

```typescript
import { IMAGE_EXTS } from './scanner'
```

2. 将 `createOrientedImage` 内的硬编码列表替换为从 `IMAGE_EXTS` 派生：

```typescript
// 修改前（第 14-16 行）
const isSharpFormat = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.avif',
  '.bmp',
  '.tif',
  '.tiff'
].includes(extname(path).toLowerCase())

// 修改后
const ext = extname(path).toLowerCase()
const isSharpFormat = IMAGE_EXTS.has(ext) && ext !== '.heic' && ext !== '.heif'
```

**验证**：`npm run typecheck` 通过；`npm run lint` 无新增警告。

---

### F4 【低-性能】`existsSync` 在异步扫描循环中阻塞事件循环

**现状**：`src/main/scanner.ts:109-110` 在 `mapLimit` 的异步回调中对每个文件调用同步 `existsSync`。对于数万张照片的大文件夹，同步 stat 调用累计阻塞主进程，期间 IPC 响应延迟（网络盘/慢存储更明显）。

**修复文件**：`src/main/scanner.ts`

**修复步骤**：

1. 文件顶部已 `import { readdir, stat } from 'fs/promises'`，无需新增 import。`existsSync` 仍用于其他地方（`thumbs.ts`），本文件移除对 `existsSync` 的使用即可。

2. 将第 108-111 行改为异步检查：

```typescript
// 修改前
const thumbExists =
  prev != null && prev.thumbPath != null && existsSync(join(getThumbsDir(), prev.thumbPath))

// 修改后
let thumbExists = false
if (prev != null && prev.thumbPath != null) {
  try {
    await stat(join(getThumbsDir(), prev.thumbPath))
    thumbExists = true
  } catch {
    thumbExists = false
  }
}
```

3. 检查文件顶部的 `import { existsSync } from 'fs'`：若本文件不再有其他 `existsSync` 调用，移除该 import 以保持整洁。先用 `grep existsSync src/main/scanner.ts` 确认。

**验证**：`npm run typecheck` 通过；对大文件夹（>1000 张）扫描时观察 UI 不卡顿。

---

### F5 【低-健壮性】无单实例锁

**风险**：用户重复启动时，两个进程同时打开同一 SQLite 库和缓存目录，存在写竞争（`SQLITE_BUSY`）与缓存重复生成。

**修复文件**：`src/main/index.ts`

**修复步骤**：

1. 在 `app.whenReady()` 之前（`registerSchemes()` 调用附近，约第 10 行后）添加单实例锁：

```typescript
// 单实例锁：第二实例激活已有窗口后退出
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}
```

2. 添加第二实例激活处理（放在 `app.whenReady()` 回调内或紧随其后）：

```typescript
app.on('second-instance', () => {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    const win = windows[0]
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
})
```

**验证**：打包后尝试双开应用，第二次启动应聚焦已有窗口而非新建。

---

## 三、执行顺序建议

```
F1（安全，中危） → F2（行尾，影响 CI） → F3（冗余） → F4（性能） → F5（单实例）
```

- **F1** 优先级最高，是唯一的中危安全项。
- **F2** 应紧接其后，否则 CI 的 lint 会持续带 271 条警告。
- **F3-F5** 均为低危，可一次性提交或按需排期。
- 所有修复完成后运行 `npm run typecheck && npm run lint` 确认零错误零警告。

---

## 四、提交规范建议

每项修复独立提交，便于回溯：

```
fix(security): 校验 shell.openExternal 的 URL 协议为 http/https  # F1
style: 统一行尾为 LF，消除 271 条 prettier 警告                  # F2
refactor(ipc): 从 IMAGE_EXTS 派生 sharp 格式列表，消除重复       # F3
perf(scanner): existsSync 改为异步 stat，避免阻塞事件循环        # F4
feat(main): 添加单实例锁，防止多开导致 DB/缓存竞争               # F5
```

---

## 五、不在本轮修复范围但建议后续跟进

以下为上轮已记录但未修复的设计级问题（非漏洞），可纳入后续迭代：

- 数据库备份/导出/导入机制（原 2.2）
- 数据库迁移机制 `PRAGMA user_version`（原 2.12）
- 窗口/侧边栏/视图状态持久化（原 2.15-2.17）
- 日志文件持久化（原 2.13）
- 自动更新机制 `electron-updater`（原 2.14）
- i18n 国际化框架（原 2.7）
- 照片批量操作（原 2.9）
