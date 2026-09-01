---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '63cc2511-1a83-4195-8420-9ed0216c8419'
  PropagateID: '63cc2511-1a83-4195-8420-9ed0216c8419'
  ReservedCode1: 'c878030a-8255-46d7-9c77-9a93350f9908'
  ReservedCode2: 'c878030a-8255-46d7-9c77-9a93350f9908'
---

# Photobooth 代码审查报告

> **审查范围**：`src/` 全部源码（main / preload / shared / renderer）、配置文件、CSS 样式
> **审查日期**：2026-08-28
> **项目版本**：1.0.0

---

## 一、冗余代码

### 1.1 `listPhotos` 与 `listGpsPhotos` 过滤逻辑重复

**文件**：`src/main/db.ts` 第 128-159 行 vs 第 171-188 行

`listPhotos` 和 `listGpsPhotos` 中过滤条件构建逻辑几乎完全相同：

```typescript
// listPhotos (第 136-141 行)
if (opts.filter === 'favorite') {
  where.push('favorite = 1')
} else if (opts.filter === 'rated') {
  where.push('rating >= ?')
  params.push(opts.minRating ?? 1)
}
pushSearchClause(where, params, opts.search)

// listGpsPhotos (第 174-180 行) — 完全相同
if (opts.filter === 'favorite') {
  where.push('favorite = 1')
} else if (opts.filter === 'rated') {
  where.push('rating >= ?')
  params.push(opts.minRating ?? 1)
}
pushSearchClause(where, params, opts.search)
```

**建议**：抽取一个 `applyFilterSearch(where, params, opts)` 公共函数，两处调用复用。

### 1.2 `listFolders` 与 `getFolder` 查询重复

**文件**：`src/main/db.ts` 第 64-72 行 vs 第 74-83 行

两个函数使用完全相同的 SQL 查询（仅多一个 `WHERE f.id = ?`）：

```sql
-- listFolders
SELECT f.id, f.path, f.name,
       (SELECT COUNT(*) FROM photos p WHERE p.folder_id = f.id) AS photoCount
FROM folders f ORDER BY f.added_at

-- getFolder
SELECT f.id, f.path, f.name,
       (SELECT COUNT(*) FROM photos p WHERE p.folder_id = f.id) AS photoCount
FROM folders f WHERE f.id = ?
```

**建议**：`getFolder` 可复用 `listFolders` 后过滤，或提取公共 SQL 片段。影响较小，属轻度冗余。

### 1.3 `generateThumb` 与 `generateThumbHeic` 中 sharp 压缩逻辑重复

**文件**：`src/main/thumbs.ts` 第 136-141 行 vs 第 153-158 行

```typescript
// generateThumb (常规格式)
await img
  .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 82 })
  .toFile(join(thumbsDir, thumbPath))

// generateThumbHeic (HEIC 格式)
await sharp(decoded.data, { raw: { ... } })
  .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 82 })
  .toFile(join(thumbsDir, thumbPath))
```

`.resize()` 和 `.jpeg()` 参数完全一致，可提取为 helper 函数。影响较小。

### 1.4 `RatingStars` 的 `size` prop 未被使用

**文件**：`src/renderer/src/components/RatingStars.tsx` 第 7 行

```typescript
size?: 'sm' | 'md'
```

`size` 属性在组件内部传递给 className（`stars-${size}`），CSS 中有 `.stars-sm .star` 样式（第 534 行），但项目中所有调用处都使用默认值 `'md'`，没有任何地方传入 `'sm'`。属于预留但未使用的 API。

### 1.5 `base.css` 残留 electron-vite 模板变量

**文件**：`src/renderer/src/assets/base.css` 第 1-24 行

以下变量在整个项目中从未被引用（仅在 `base.css` 自身的 `:root` 第二块中被映射）：

```css
--ev-c-white        /* 从未被引用 */
--ev-c-white-soft   /* 从未被引用 */
--ev-c-white-mute   /* 从未被引用 */
--ev-c-gray-1       /* 被 main.css 引用（--ev-c-gray-1），实际有使用 */
```

`--ev-c-white`、`--ev-c-white-soft`、`--ev-c-white-mute` 是 electron-vite 模板自带的颜色变量，暗色主题下完全不使用白色系，可清理。

### 1.6 `TECHNICAL_PLAN.md` 中 M4 未勾选

**文件**：`docs/TECHNICAL_PLAN.md` 第 91 行

```
- **M4** HEIC 缩略图完善、搜索、性能优化、打包分发（electron-builder）
```

缺少 `[x]` 标记，但 README 和功能清单都标注 M4 已完成。文档不一致。

---

## 二、遗漏的重要设计考虑

### 2.1 【高】移除文件夹无确认对话框

**文件**：`src/main/ipc.ts` 第 23-26 行 / `src/renderer/src/components/Sidebar.tsx` 第 73-79 行

```typescript
// ipc.ts — 直接删除，无确认
ipcMain.handle('folders:remove', (_e, id: number) => {
  const removed = db.removeFolder(id)
  if (removed.length > 0) removeCacheFiles(removed)
})
```

```typescript
// Sidebar.tsx — 点击 × 直接调用
onClick={(e) => {
  e.stopPropagation()
  onRemove(f.id)
}}
```

用户点击"×"移除文件夹时，**瞬间删除全部照片索引和缓存**，虽然不删除磁盘文件，但评分、收藏等用户数据全部丢失，且不可恢复（无回收站机制）。误触风险高。

**建议**：添加确认对话框（`dialog.showMessageBox`），至少提示"移除后照片评分和收藏数据将丢失，确定继续？"。

### 2.2 【高】数据库无备份/导出/导入机制

**文件**：`src/main/db.ts` / `src/main/index.ts`

所有用户数据（评分、收藏、EXIF 元数据）存储在单一 SQLite 文件中。以下场景会导致数据丢失：

- 用户清理应用数据目录
- 数据库文件损坏
- 重装系统
- 迁移到新电脑

**未考虑**：

- 无数据库备份功能
- 无评分/收藏数据导出（如 JSON/CSV）
- 无数据导入恢复机制
- 无数据库完整性检查（启动时 `PRAGMA integrity_check`）

### 2.3 【高】扫描超大文件夹时无取消机制

**文件**：`src/main/scanner.ts` 第 68-147 行

`scanFolder` 函数一旦开始，无法中途取消。对于包含数万张照片的文件夹，用户可能等待很长时间且无法中止。

```typescript
export async function scanFolder(folderId: number, dir: string): Promise<void> {
  if (scanningFolders.has(folderId)) return
  scanningFolders.add(folderId)
  // ... 扫描循环，无取消检查点
  await mapLimit(files, 4, async (filePath) => {
    // ... 没有检查取消标志
  })
}
```

**建议**：添加 `AbortController` 或取消标志，IPC 暴露 `folders:cancelScan` 通道，循环中定期检查。

### 2.4 【高】EXIF 解析无超时控制

**文件**：`src/main/exif.ts` 第 80-119 行 / `src/main/scanner.ts` 第 97 行

```typescript
const exif = await parseExif(filePath) // 无超时
```

`exifr.parse` 对于损坏的文件或特殊格式可能挂起（无超时），会阻塞并发池中的 worker。当前 4 线程并发池中，只要 4 个文件同时挂起，整个扫描就卡死。

**建议**：为 `parseExif` 添加超时包装（如 `Promise.race` + 10s 超时），超时后返回空 EXIF 并跳过。

### 2.5 【高】`sharp` 处理无超时控制

**文件**：`src/main/thumbs.ts` 第 128-147 行 / `src/main/scanner.ts` 第 98 行

```typescript
const { thumbPath, width, height } = await generateThumb(filePath) // 无超时
```

与 EXIF 同理，sharp 处理损坏的或极大的图像文件时可能挂起或极慢，阻塞并发池。

### 2.6 【中】Lightbox 缩放时 `wheel` 事件未做被动监听优化

**文件**：`src/renderer/src/components/Lightbox.tsx` 第 99 行

```typescript
window.addEventListener('wheel', onWheel, { passive: false })
```

`passive: false` 会阻塞主线程滚动渲染。虽然此组件需要 `preventDefault` 来阻止默认缩放，但仅在 `e.ctrlKey` 为 true 时才需要阻止。可以改为 `passive: true`，仅在检测到 Ctrl 键时才动态阻止。

实际上这个监听器**始终注册在 window 上**（即使 Lightbox 未打开），因为 `useEffect` 的依赖是空数组 `[]`，组件卸载时才移除。这意味着即使用户不在看大图，每次滚轮事件都会触发回调判断。

**建议**：将 `wheel` 监听绑定到 `stageRef.current`（舞台 DOM 元素）而非 `window`，且仅在 Lightbox 打开时生效。

### 2.7 【中】无国际化（i18n）框架

**项目全局**

所有 UI 文案均为硬编码中文字符串，分散在多个组件中：

- `'全部'`、`'♥ 收藏'`、`'★ ≥ 1'`（`App.tsx`）
- `'暂无照片'`、`'已全部加载'`、`'加载中…'`（`PhotoGrid.tsx`）
- `'该文件夹暂无带位置信息的照片'`（`MapView.tsx`）
- `'拍摄时间'`、`'设备'`、`'镜头'`（`Lightbox.tsx`）

无 i18n 框架（如 react-i18next），未来如需多语言支持需大量改动。

### 2.8 【中】地图 marker 无照片预览（Tooltip）

**文件**：`src/renderer/src/components/MapView.tsx` 第 110 行

```typescript
const marker = L.marker(pos, { icon, title: p.filename })
```

仅设置了 `title`（原生 tooltip），鼠标悬停时显示系统 tooltip，延迟长且样式不可控。未使用 Leaflet 的 `bindTooltip` 提供即时弹出的文件名提示。对于密集 marker，用户难以辨别照片内容。

**建议**：添加 `marker.bindTooltip(p.filename, { direction: 'top', offset: [0, -22] })`。

### 2.9 【中】无照片批量操作

**文件**：全局

当前仅支持单张照片的评分/收藏。未考虑：

- 批量评分（选中多张统一设星级）
- 批量收藏/取消收藏
- 批量删除（从索引中移除）

对于大型相册（数百张照片），逐张操作效率很低。

### 2.10 【中】无照片删除/隐藏功能

**文件**：全局

用户无法从应用内删除不需要的照片（仅能通过右键"在资源管理器中打开"后手动删除）。也未考虑"隐藏照片"功能（从视图中排除但不删除磁盘文件）。

### 2.11 【中】CSP 未限制 `connect-src`

**文件**：`src/renderer/index.html` 第 9 行

```html
content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'
data: thumbs: photo: https://tile.openstreetmap.org ..."
```

`default-src 'self'` 会将 `connect-src` 回退到 `'self'`，理论上限制了 fetch/XHR 请求。但 Leaflet 加载瓦片使用的是 `<img>` 标签（受 `img-src` 管控），所以地图能正常工作。

不过，如果未来添加任何需要 `fetch` 的功能（如在线搜索），需要在 CSP 中显式添加 `connect-src`。当前设计是安全的，但可考虑显式声明 `connect-src 'self'` 以提高可读性。

### 2.12 【中】数据库迁移机制缺失

**文件**：`src/main/db.ts` 第 52-56 行

```typescript
export function initDb(dbPath: string): void {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
}
```

使用 `CREATE TABLE IF NOT EXISTS`，但没有版本号或迁移机制。未来如需添加新列（如标签、颜色标记、备注等），只能手动 `ALTER TABLE`，且无法区分新旧数据库结构。

**建议**：引入 schema 版本号（`PRAGMA user_version`），启动时检查并执行迁移脚本。

### 2.13 【中】无日志系统

**文件**：全局

错误处理使用 `console.error` / `console.log`：

```typescript
// thumbs.ts 第 80 行
console.log(`[cache] 预览缓存超出 ...`)

// thumbs.ts 第 162 行
console.error('[thumbs:heic]', filePath, e)

// scanner.ts — 扫描错误仅推送到 UI，无持久化
```

无日志文件持久化，应用重启后错误信息丢失。对于桌面应用，应考虑将日志写入文件，方便用户反馈问题。

### 2.14 【中】无自动更新机制

**文件**：`src/main/index.ts`

未集成 `electron-updater` 或其他自动更新方案。用户需要手动下载新版本安装包。对于已分发的桌面应用，自动更新是重要功能。

### 2.15 【中】窗口状态未持久化

**文件**：`src/main/index.ts` 第 17-30 行

```typescript
const mainWindow = new BrowserWindow({
  width: 1280,
  height: 800,
  minWidth: 610
  // ...
})
```

窗口尺寸和位置硬编码为 1280×800，每次启动都恢复默认值。用户调整窗口大小后，下次打开又回到默认。

**建议**：使用 `electron-window-state` 或手动 `getBounds` / `setBounds` + 持久化。

### 2.16 【中】侧边栏面板状态未持久化

**文件**：`src/renderer/src/App.tsx` 第 55-56 行

```typescript
const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
```

侧边栏的展开/折叠状态和宽度比例不持久化，每次启动恢复默认。

### 2.17 【中】视图状态不持久化

**文件**：`src/renderer/src/App.tsx` 第 43-54 行

```typescript
const [view, setView] = useState<View>('grid')
const [filterId, setFilterId] = useState('all')
const [sortBy, setSortBy] = useState<SortBy>('taken_desc')
```

用户上次选择的视图模式（网格/地图）、过滤条件、排序方式、搜索关键字都不保存。每次启动都回到默认值。

### 2.18 【中】`photo://` 协议未校验文件扩展名白名单

**文件**：`src/main/protocols.ts` 第 37-50 行

```typescript
protocol.handle('photo', async (req) => {
  const p = new URL(req.url).searchParams.get('p') ?? ''
  if (!isAbsolute(p) || !existsSync(p)) {
    return new Response('Not found', { status: 404 })
  }
  const ext = extname(p).toLowerCase()
  if (ext === '.heic' || ext === '.heif') {
    // ...
  }
  return net.fetch(pathToFileURL(p).toString())
})
```

虽然校验了绝对路径和文件存在性，但**未校验文件扩展名是否为支持的图像格式**。理论上可以通过 `photo://local/?p=C:\path\to\any\file` 加载任意本地文件（如文本文件、可执行文件），虽然浏览器只能渲染图像格式，但从安全角度应加白名单。

**建议**：添加扩展名白名单校验，仅允许 `IMAGE_EXTS` 中的格式。

### 2.19 【中】`thumbs://` 协议缓存重建时的竞态条件

**文件**：`src/main/protocols.ts` 第 22-34 行

```typescript
protocol.handle('thumbs', async (req) => {
  const name = basename(new URL(req.url).pathname)
  const file = join(thumbsDir, name)
  if (!existsSync(file)) {
    const orig = findPathByThumbPath(name)
    if (orig) {
      const res = await generateThumb(orig) // 异步生成
      if (res.thumbPath) return net.fetch(pathToFileURL(file).toString())
    }
    return new Response('Not found', { status: 404 })
  }
  return net.fetch(pathToFileURL(file).toString())
})
```

如果多个缩略图同时缺失并同时请求重建，同一文件可能被并发生成多次（`generateThumb` 无去重）。对比 `getPreviewPath` 中使用了 `previewTasks` Map 做去重，`generateThumb` 缺少类似机制。

**建议**：为 `generateThumb` 添加类似 `previewTasks` 的去重 Map。

### 2.20 【低】`mapLimit` 并发数硬编码

**文件**：`src/main/scanner.ts` 第 85 行

```typescript
await mapLimit(files, 4, async (filePath) => { ... })
```

并发数 `4` 硬编码，无法配置。对于 SSD 或高性能机器可以更高，对于低配机器可能偏高。应考虑可配置或基于 CPU 核数动态计算。

### 2.21 【低】`THUMB_SIZE` 硬编码为 512

**文件**：`src/main/thumbs.ts` 第 125 行

```typescript
const THUMB_SIZE = 512
```

缩略图尺寸固定 512px，无法根据屏幕分辨率（如 HiDPI / Retina）或网格显示尺寸动态调整。在高 DPI 屏幕上 512px 可能略显模糊。

### 2.22 【低】网格列宽硬编码为 160px

**文件**：`src/renderer/src/assets/main.css` 第 274 行

```css
grid-template-columns: repeat(auto-fill, 160px);
```

网格卡片大小固定 160px，用户无法调整。不同用户可能偏好更大或更小的缩略图。可考虑提供"小/中/大"选项或可拖拽调整。

### 2.23 【低】无键盘快捷键体系

**文件**：全局

仅 Lightbox 有键盘支持（←/→/Esc）。未考虑：

- 全局快捷键（如 `Ctrl+F` 聚焦搜索框）
- 网格中 `Space` 预览 / `F` 收藏
- 切换视图的快捷键
- `Del` 移除文件夹

### 2.24 【低】地图视图无搜索/过滤联动提示

**文件**：`src/renderer/src/components/MapView.tsx`

地图视图支持搜索和过滤（通过 `opts` 传递），但用户切换底图或过滤时，地图上无视觉反馈表明当前显示的是过滤后的结果。仅在底部有"N 张没有位置信息"的提示，但不显示"当前显示 X 张 / 共 Y 张"。

### 2.25 【低】`formatBytes` 对大文件不够精确

**文件**：`src/renderer/src/utils/format.ts` 第 13-17 行

```typescript
export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
```

对于 GB 级文件（如视频、大 TIFF），只显示 MB，数值会很大（如 `10240.0 MB`）。应增加 GB 单位。

### 2.26 【低】无 Accessibility（无障碍）支持

**文件**：全局

- 照片网格的 `<figure>` 无 `tabIndex` 和键盘导航支持
- 侧边栏文件夹列表无 `role="list"` / `role="listitem"`
- 视图切换按钮无 `aria-pressed`
- 地图 marker 无 `aria-label`
- `RatingStars` 有 `role="radiogroup"` 和 `aria-label`（较好），但 star 按钮无 `aria-checked`

### 2.27 【低】CSS 中存在未使用的变量

**文件**：`src/renderer/src/assets/base.css`

- `--ev-button-alt-border` / `--ev-button-alt-text` / `--ev-button-alt-bg` / `--ev-button-alt-hover-*`（第 18-23 行）：这组变量在项目中从未被引用，是 electron-vite 模板残留。
- `--color-background-soft` / `--color-background-mute`（第 28-29 行）：在 `main.css` 中直接使用 `--ev-c-black-soft` / `--ev-c-black-mute`，这层映射变量未被使用。

### 2.28 【低】`removeFolder` 的 `ON DELETE CASCADE` 依赖

**文件**：`src/main/db.ts` 第 95-102 行

```typescript
export function removeFolder(id: number): string[] {
  const rows = db.prepare('SELECT path FROM photos WHERE folder_id = ?').all(id)
  db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  return rows.map((r) => r.path)
}
```

先查 photos 再删 folders，依赖外键级联删除 photos 记录。但 SQLite 默认**不启用外键约束**（需要 `PRAGMA foreign_keys = ON`）。代码中仅设置了 `PRAGMA journal_mode = WAL`，**未启用 `PRAGMA foreign_keys = ON`**。

这意味着 `ON DELETE CASCADE` **实际上不生效**——删除 folder 后 photos 记录不会被自动删除，变成孤儿数据。

**严重性**：这是一个实际存在的 bug。`removeFolder` 删除 folder 后，关联的 photos 记录仍然留在数据库中，成为孤儿数据。虽然 `removeFolder` 返回了照片路径用于清理缓存，但数据库中的 photos 记录未被清理。

**建议**：在 `initDb` 中添加 `db.pragma('foreign_keys = ON')`，或改为显式删除 photos：`db.prepare('DELETE FROM photos WHERE folder_id = ?').run(id)` 再删 folder。

---

## 三、审查统计

### 冗余代码汇总

| 编号 | 严重性 | 文件              | 问题                                        |
| ---- | ------ | ----------------- | ------------------------------------------- |
| 1.1  | 低     | db.ts             | `listPhotos` / `listGpsPhotos` 过滤逻辑重复 |
| 1.2  | 低     | db.ts             | `listFolders` / `getFolder` SQL 重复        |
| 1.3  | 低     | thumbs.ts         | 缩略图压缩参数重复                          |
| 1.4  | 低     | RatingStars.tsx   | `size` prop 预留但从未使用                  |
| 1.5  | 低     | base.css          | 模板残留的白色系变量未使用                  |
| 1.6  | 低     | TECHNICAL_PLAN.md | M4 标记不一致                               |

### 遗漏设计考虑汇总

| 编号     | 严重性 | 领域           | 问题                                                 |
| -------- | ------ | -------------- | ---------------------------------------------------- |
| 2.1      | **高** | UX 安全        | 移除文件夹无确认对话框                               |
| 2.2      | **高** | 数据安全       | 无数据库备份/导出/导入机制                           |
| 2.3      | **高** | UX             | 扫描超大文件夹无取消机制                             |
| 2.4      | **高** | 稳定性         | EXIF 解析无超时控制                                  |
| 2.5      | **高** | 稳定性         | sharp 图像处理无超时控制                             |
| 2.6      | 中     | 性能           | Lightbox wheel 监听始终挂在 window                   |
| 2.7      | 中     | 可维护性       | 无 i18n 国际化框架                                   |
| 2.8      | 中     | UX             | 地图 marker 无照片名 Tooltip                         |
| 2.9      | 中     | 功能           | 无照片批量操作                                       |
| 2.10     | 中     | 功能           | 无照片删除/隐藏功能                                  |
| 2.11     | 中     | 安全           | CSP 未显式声明 connect-src                           |
| 2.12     | 中     | 可维护性       | 无数据库迁移机制                                     |
| 2.13     | 中     | 运维           | 无日志文件持久化                                     |
| 2.14     | 中     | 运维           | 无自动更新机制                                       |
| 2.15     | 中     | UX             | 窗口尺寸/位置未持久化                                |
| 2.16     | 中     | UX             | 侧边栏状态未持久化                                   |
| 2.17     | 中     | UX             | 视图/过滤/排序状态未持久化                           |
| 2.18     | 中     | 安全           | photo:// 协议无扩展名白名单                          |
| 2.19     | 中     | 稳定性         | thumbs:// 缓存重建无去重                             |
| 2.20     | 低     | 可配置性       | 并发数硬编码                                         |
| 2.21     | 低     | 可配置性       | 缩略图尺寸硬编码                                     |
| 2.22     | 低     | 可配置性       | 网格列宽硬编码                                       |
| 2.23     | 低     | UX             | 无全局键盘快捷键体系                                 |
| 2.24     | 低     | UX             | 地图过滤结果无数量提示                               |
| 2.25     | 低     | 细节           | formatBytes 缺 GB 单位                               |
| 2.26     | 低     | 无障碍         | 缺少 ARIA 属性                                       |
| 2.27     | 低     | 清洁性         | CSS 模板残留变量                                     |
| **2.28** | **高** | **数据完整性** | **SQLite 外键级联未启用，removeFolder 产生孤儿数据** |

---

## 四、总结

### 冗余代码

项目代码整体较为简洁，冗余问题集中在 6 处低严重性的重复，主要是 SQL 查询逻辑和模板残留。不存在大段死代码或废弃模块。

### 遗漏的重要设计考虑

共发现 28 项遗漏，按严重性分布：

| 严重性 | 数量 | 代表性问题                                                              |
| ------ | ---- | ----------------------------------------------------------------------- |
| 高     | 6    | 外键级联未生效（实际 bug）、移除无确认、扫描不可取消、EXIF/sharp 无超时 |
| 中     | 13   | 状态不持久化、无数据库迁移、无日志、无批量操作、CSP/connect-src         |
| 低     | 9    | 硬编码参数、无快捷键、无障碍缺失                                        |

**最需优先修复的问题**：

1. **2.28 — SQLite 外键级联未启用**：这是一个实际存在的 bug，会导致移除文件夹后照片记录成为孤儿数据。修复仅需在 `initDb` 中添加一行 `db.pragma('foreign_keys = ON')`。
2. **2.1 — 移除文件夹无确认**：误触风险高，用户数据不可恢复。
3. **2.4 / 2.5 — EXIF/sharp 无超时**：损坏文件可能导致扫描卡死。

> AI生成
