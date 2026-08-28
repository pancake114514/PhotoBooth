---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '662f29c1-6d7f-43d4-a2bb-310a17eccd66'
  PropagateID: '662f29c1-6d7f-43d4-a2bb-310a17eccd66'
  ReservedCode1: '1ff6c3cf-a96a-4dde-869c-6da5cc7fa432'
  ReservedCode2: '1ff6c3cf-a96a-4dde-869c-6da5cc7fa432'
---

# Photobooth 功能清单

> **项目定位**：桌面端相册管理工具——主流格式图像预览、EXIF 信息读取（含位置与设备信息）、星级与收藏、地图位置展示，提供 iOS 相册式本地照片管理体验。
>
> **技术架构**：Electron 39 + React 19 + TypeScript 5.9，基于 electron-vite 脚手架构建，三段式架构（main / preload / renderer）。

---

## 一、功能总览

| 模块 | 功能项 | 简述 |
|------|--------|------|
| 文件夹管理 | 多文件夹管理 | 侧边栏添加 / 移除 / 切换 / 重新扫描多个照片文件夹 |
| 文件夹管理 | 侧边栏折叠 | 侧边栏可折叠为窄条、拖动分隔条调整宽度 |
| 文件夹管理 | 右键菜单 | 文件夹右键支持"在资源管理器中打开" |
| 照片扫描 | 递归扫描 | 自动遍历子目录，识别 11 种主流图像格式 |
| 照片扫描 | 增量扫描 | 基于文件 mtime + size 比对，跳过未变化文件 |
| 照片扫描 | 并发处理 | 4 线程并发池处理 EXIF + 缩略图生成 |
| 照片扫描 | 进度推送 | 实时推送扫描进度（遍历中 / 处理中 / 完成 / 错误） |
| 照片扫描 | 自动清理 | 扫描结束后自动删除已从磁盘移除的照片记录及缓存 |
| 照片扫描 | 防重复 | 同一文件夹不会同时触发两次扫描 |
| 缩略图 | 自动生成 | sharp 生成 512px JPEG 缩略图，质量 82 |
| 缩略图 | HEIC 解码 | heic-decode 解码 HEIC/HEIF 后 sharp 压缩为 JPEG |
| 缩略图 | 缓存重建 | 缩略图缓存缺失时按需自动重建，避免裂图 |
| 缩略图 | 预览缓存 | HEIC 大图预览转全分辨率 JPEG，LRU 清理（上限 200MB） |
| 缩略图 | 孤儿清理 | 照片删除 / 文件夹移除时清理对应缓存文件 |
| EXIF 解析 | 拍摄信息 | 拍摄时间、设备厂商、型号、镜头型号 |
| EXIF 解析 | 拍摄参数 | 焦距、光圈、快门速度、ISO |
| EXIF 解析 | GPS 信息 | 经纬度（DMS→十进制）、海拔，含方向修正 |
| EXIF 解析 | 日期兼容 | 兼容 Date 对象、ExifDateTime、字符串格式 |
| 照片网格 | 无限滚动 | IntersectionObserver 懒加载，400px 预加载阈值 |
| 照片网格 | 懒加载缩略图 | `<img loading="lazy">` + 缩略图协议加载 |
| 照片网格 | 角标显示 | 收藏 ♥ 角标 + 星级 ★ 角标 |
| 照片网格 | 右键菜单 | 照片右键支持"在资源管理器中打开""用系统图片浏览器打开" |
| 大图预览 | 缩放浏览 | Ctrl + 滚轮缩放（1~8 倍），缩放中心跟随鼠标 |
| 大图预览 | 拖拽平移 | 放大后鼠标拖拽平移，自动约束边界 |
| 大图预览 | 键盘导航 | ← / → 翻页，Esc 关闭 |
| 大图预览 | 跨页加载 | 翻到已加载末尾时自动请求下一页 |
| 大图预览 | EXIF 详情栏 | 右侧信息面板（可收起），展示完整拍摄参数 |
| 大图预览 | 评分收藏 | 大图预览中直接设置星级与收藏 |
| 地图视图 | 位置标注 | 带 GPS 照片以圆形缩略图 marker 展示 |
| 地图视图 | 聚簇显示 | markercluster 密集时自动聚合，分块加载 |
| 地图视图 | 底图切换 | 高德 / 高德卫星 / OSM / ArcGIS 四种底图 |
| 地图视图 | 坐标纠偏 | 国内底图自动 WGS-84 → GCJ-02 火星坐标转换 |
| 地图视图 | 自适应视野 | 照片变化时自动 fitBounds，切换底图保持视角 |
| 地图视图 | 点击预览 | 点击 marker 直接打开照片大图 |
| 地图视图 | 无 GPS 提示 | 显示无位置信息照片数量 |
| 过滤排序 | 过滤 | 全部 / 仅收藏 / ★≥1 / ★★★≥3 / ★★★★≥4 |
| 过滤排序 | 排序 | 最新优先 / 最旧优先 / 按文件名 |
| 搜索 | 文件名搜索 | 按文件名 / 路径关键字模糊匹配，300ms 防抖 |
| 星级收藏 | 星级评分 | 0-5 星评分，点击当前星级可清除 |
| 星级收藏 | 收藏标记 | 收藏 / 取消收藏，网格与大图均可操作 |
| 星级收藏 | 数据持久 | 评分 / 收藏存 SQLite，重新扫描不覆盖 |
| 安全机制 | 上下文隔离 | contextIsolation + contextBridge，渲染进程不接触 Node.js |
| 安全机制 | CSP 策略 | 限制脚本 / 样式 / 图片来源，仅允许自定义协议和指定瓦片域名 |
| 安全机制 | 路径消毒 | 自定义协议使用 basename 防目录穿越，校验绝对路径 |
| 安全机制 | 数据安全 | 移除文件夹仅删索引，绝不删除磁盘照片文件 |

---

## 二、功能详细说明

### 2.1 文件夹管理

**侧边栏交互**（`Sidebar.tsx`）

- 添加文件夹：点击"＋"按钮，弹出系统目录选择对话框，选择后自动开始扫描
- 移除文件夹：点击文件夹项右侧"×"按钮，同步清理该文件夹的照片记录和缩略图缓存
- 切换文件夹：点击文件夹项切换当前相册，自动重新加载照片列表 / 地图数据
- 重新扫描：工具栏"重新扫描"按钮，对当前文件夹执行增量扫描
- 侧边栏折叠：宽度低于 100px 自动折叠为窄条，点击窄条展开恢复
- 右键菜单：文件夹右键"在资源管理器中打开"
- 扫描进度：文件夹项内显示扫描百分比，工具栏显示扫描状态

**面板布局**（`App.tsx` + `react-resizable-panels`）

- 侧边栏面板：可折叠，范围 200~400px，折叠宽度 40px
- 主区域面板：最小 400px
- 分隔条可拖拽调整两侧比例
- 窗口最小宽度 610px（折叠侧边栏时平铺三列缩略图 / 展开时满足面板最小值）

### 2.2 照片扫描

**扫描器**（`scanner.ts`）

- 支持格式：`.jpg` `.jpeg` `.png` `.webp` `.gif` `.avif` `.heic` `.heif` `.bmp` `.tif` `.tiff`（共 11 种）
- 跳过目录：`node_modules`、`.git`、`$RECYCLE.BIN`、隐藏目录（`.`开头）
- 递归遍历：深度优先遍历所有子目录
- 无权限目录自动跳过，不中断扫描
- 并发处理：4 线程并发池（mapLimit），每张照片依次执行 stat → EXIF 解析 → 缩略图生成 → 入库
- 增量跳过：文件 mtime 和 size 均未变化且缩略图缓存存在时跳过 EXIF / 缩略图处理
- 单文件失败容错：扫描中被移动 / 删除的文件自动跳过，不中断整体扫描
- 进度推送频率：每处理 5 张或最后一张推送进度
- 扫描结束清理：删除数据库中本次未出现的记录（文件已删除 / 移动），同步清理对应缓存
- 扫描完成提示：显示跳过数量（如有），3 秒后自动消失

### 2.3 缩略图引擎

**缩略图生成**（`thumbs.ts`）

- 缩略图规格：512px 最大边，`fit: 'inside'`，不放大，JPEG 质量 82
- 缩略图命名：文件路径 SHA-1 哈希 + `.jpg`
- 常规格式：sharp 直接处理（支持自动旋转，failOn 宽容，像素上限 256MP）
- HEIC/HEIF：heic-decode 解码为 RGBA → sharp 压缩为 JPEG
- 生成失败容错：返回 `thumbPath: null`，前端回退到原图协议加载

**大图预览缓存**

- 用途：Chromium 无法解码 HEIC，需预转全分辨率 JPEG 供大图浏览
- 转码质量：JPEG 85，保留原始分辨率（不降采样），自动旋转
- 缓存命名：缩略图哈希 + `-pv.jpg` 后缀
- 防重复转码：同一文件的并发转码请求复用同一 Promise
- LRU 清理：预览缓存超 200MB 时按 mtime 从旧到新删除，降至 180MB 停止
- 节流策略：最多 30s 检查一次，并发调用复用同一清理任务

**缓存清理**

- 移除文件夹：清理该文件夹所有照片的缩略图 + 预览缓存
- 扫描清理：扫描后删除已移除照片的缓存
- 启动检查：应用启动时检查预览缓存容量

### 2.4 EXIF 解析

**解析器**（`exif.ts`）

- 解析库：exifr，指定字段提取（pick 模式）
- 提取字段：Make、Model、LensModel、FNumber、ISO、ExposureTime、FocalLength、DateTimeOriginal、GPSLatitude/Longitude/Altitude + Ref
- GPS 转换：DMS（度分秒）→ 十进制经纬度，根据 N/S/E/W 方向修正正负
- Rational 转换：exifr 输出的 `[numerator, denominator]` 分数自动转 number
- 快门格式化：`< 1s` → `1/125s`，`≥ 1s` → `2s`
- 日期解析：兼容 Date 对象、ExifDateTime（`.toDate()`）、EXIF 字符串格式（`2024:01:01 10:00:00`）
- 海拔处理：根据 GPSAltitudeRef 判断正负
- GPS 配对：经纬度同时为空时返回 null，避免半残数据
- 解析失败容错：任何异常返回全 null，不中断扫描

### 2.5 自定义协议

**协议注册**（`protocols.ts`）

| 协议 | 用途 | 安全措施 |
|------|------|----------|
| `thumbs://thumb/<缓存名>` | 加载缩略图 | basename 消毒防目录穿越；缓存缺失自动重建 |
| `photo://local/?p=<路径>` | 加载原图 | 校验绝对路径 + 文件存在；HEIC 自动转 JPEG 预览 |

- 缩略图缓存缺失时：通过 `findPathByThumbPath` 反查原文件路径 → 重新生成缩略图 → 返回
- HEIC 原图加载：调用 `getPreviewPath` 获取预览缓存（自动转码）；转码失败回退原图
- 非常规格式（BMP/TIFF 等）：直接返回原图文件，由浏览器尝试解码

### 2.6 照片网格

**网格组件**（`PhotoGrid.tsx`）

- 无限滚动：底部哨兵元素 + IntersectionObserver，`rootMargin: 400px` 提前触发加载
- 每页加载：120 张（PAGE_SIZE）
- 缩略图加载：有缓存用 `thumbs://` 协议，无缓存回退 `photo://` 协议
- 图片角标：收藏显示 ♥，星级显示对应数量 ★
- 底部信息：文件名 + 拍摄日期
- 右键菜单：在资源管理器中打开 / 用系统图片浏览器打开
- 空状态：无照片提示"暂无照片"，全部加载完毕提示总数

### 2.7 大图预览

**Lightbox 组件**（`Lightbox.tsx`）

- 缩放：Ctrl + 滚轮，范围 1~8 倍，步进 1.1 倍
- 缩放中心：跟随鼠标指针位置（以舞台为参考的百分比）
- 平移：放大后（zoom > 1）鼠标拖拽，自动约束边界（图片边缘不越过舞台）
- 切图重置：切换照片时自动重置缩放、平移、缩放中心
- 键盘：← 上一张、→ 下一张、Esc 关闭
- 导航按钮：首尾按钮禁用 + tooltip 提示
- 跨页加载：翻到已加载末尾时触发 `onLoadMore`，加载后可继续翻页
- 数据来源：网格模式从分页数据翻页，地图模式从全部 GPS 照片翻页
- EXIF 详情栏（右侧，可收起 / 展开）：
  - 拍摄时间、设备（厂商 + 型号）、镜头、焦距、光圈、快门、ISO
  - 尺寸（宽 × 高 px）、文件大小、GPS 坐标 + 海拔、完整文件路径
- 评分收藏：详情栏内可直接设置星级和收藏
- 缩放百分比指示器：放大时显示当前缩放比例

### 2.8 地图视图

**地图组件**（`MapView.tsx`）

- 底图列表：

  | 底图 | 来源 | 坐标系 | 说明 |
  |------|------|--------|------|
  | 高德 | webrd0{1-4}.is.autonavi.com | GCJ-02 | 默认底图，矢量地图 |
  | 卫星 | webst0{1-4}.is.autonavi.com | GCJ-02 | 高德卫星影像 |
  | OSM | tile.openstreetmap.org | WGS-84 | OpenStreetMap 矢量 |
  | ArcGIS | server.arcgisonline.com | WGS-84 | ESRI 世界街道图 |

- 坐标纠偏：使用 GCJ-02 底图时，照片 WGS-84 坐标自动转换为火星坐标（`coord.ts`）
- 境外坐标：中国大陆境外坐标不偏移，直接使用 WGS-84
- marker 样式：44×44px 圆形 divIcon，背景图为缩略图
- 聚簇参数：`maxClusterRadius: 60`，`chunkedLoading: true`，`showCoverageOnHover: false`
- 自适应视野：照片集合变化时 fitBounds（padding 48px，maxZoom 15），切换底图保持当前视角
- 点击 marker：打开对应照片的大图预览
- 无 GPS 提示：显示"N 张照片没有位置信息，未在地图上显示"
- 空状态：显示"该文件夹暂无带位置信息的照片"

### 2.9 过滤、排序与搜索

**过滤**（5 种）

| 过滤项 | 条件 |
|--------|------|
| 全部 | 无过滤 |
| ♥ 收藏 | `favorite = 1` |
| ★ ≥ 1 | `rating >= 1` |
| ★★★ ≥ 3 | `rating >= 3` |
| ★★★★ ≥ 4 | `rating >= 4` |

**排序**（3 种）

| 排序项 | SQL |
|--------|-----|
| 最新优先 | `taken_at DESC, id DESC` |
| 最旧优先 | `taken_at ASC, id ASC` |
| 按文件名 | `filename COLLATE NOCASE ASC, id ASC` |

**搜索**

- 搜索范围：文件名 + 文件路径，LIKE 模糊匹配
- 特殊字符转义：`\`、`%`、`_` 转义防通配符注入
- 防抖：输入停止 300ms 后生效
- 适用范围：照片网格 + 地图视图均生效
- 排序仅对网格生效（地图视图不排序）

### 2.10 星级与收藏

**评分控件**（`RatingStars.tsx`）

- 0-5 星，点击第 i 颗设为 i 星
- 点击当前星级可清除（归零）
- 悬停预览：鼠标悬停时高亮对应星级
- 支持两种尺寸：`sm`（小）/ `md`（中）

**数据持久化**

- 评分和收藏存储在 SQLite `photos` 表
- 增量扫描 upsert 时 **不更新** `rating` / `favorite` 字段，保留用户数据
- 评分取值约束：`Math.max(0, Math.min(5, Math.round(rating)))`
- 评分 / 收藏变更后同步更新网格、地图、大图三处 UI 数据
- 不再满足过滤条件时自动从列表移除并重新加载

### 2.11 数据库

**SQLite 数据模型**（`db.ts`）

- 引擎：better-sqlite3，WAL 模式
- 数据库文件：`{userData}/photobooth.db`

**folders 表**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| path | TEXT UNIQUE | 文件夹绝对路径 |
| name | TEXT | 文件夹名称 |
| added_at | INTEGER | 添加时间戳 |

**photos 表**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| folder_id | INTEGER FK | 关联 folders(id)，级联删除 |
| path | TEXT UNIQUE | 照片绝对路径 |
| filename | TEXT | 文件名 |
| size | INTEGER | 文件大小（字节） |
| mtime | INTEGER | 修改时间戳 |
| width / height | INTEGER | 图像尺寸 |
| format | TEXT | 格式（如 jpg、png、heic） |
| thumb_path | TEXT | 缩略图缓存文件名 |
| taken_at | INTEGER | 拍摄时间戳 |
| make / model / lens | TEXT | 设备信息 |
| fnumber | REAL | 光圈值 |
| iso | INTEGER | ISO 感光度 |
| exposure | TEXT | 快门速度（如 1/125s） |
| focal_length | INTEGER | 焦距（mm） |
| gps_lat / gps_lng | REAL | GPS 经纬度（十进制） |
| gps_alt | REAL | GPS 海拔（米） |
| rating | INTEGER | 星级 0-5（默认 0） |
| favorite | INTEGER | 收藏 0/1（默认 0） |
| created_at | INTEGER | 入库时间戳 |

**索引**

| 索引名 | 字段 | 用途 |
|--------|------|------|
| idx_photos_folder | folder_id | 按文件夹查询照片 |
| idx_photos_taken | taken_at | 按拍摄时间排序 |
| idx_photos_gps | gps_lat, gps_lng | 地图视图查询 |
| idx_photos_rating | rating, favorite | 过滤查询 |

### 2.12 安全机制

**进程隔离**

- `contextIsolation: true` + `contextBridge`：渲染进程通过类型化 API 间接调用主进程
- `sandbox: false`：因 better-sqlite3 原生模块需要（仅主进程使用，渲染进程不直接接触）
- 窗口打开拦截：外部链接通过系统浏览器打开，禁止应用内打开新窗口

**CSP 策略**（`index.html`）

- 限制 script-src / style-src 来源
- img-src 允许 `thumbs:` `photo:` 自定义协议 + 指定瓦片域名
- 阻止内联脚本和未授权资源加载

**路径安全**

- 自定义协议使用 `basename()` 提取文件名，防止 `../` 目录穿越
- `photo://` 协议校验 `isAbsolute()` + `existsSync()`，拒绝非法路径

**数据安全**

- 移除文件夹仅删除数据库索引记录，**绝不删除磁盘照片文件**
- 评分 / 收藏存储在 SQLite 外置库，不修改原始照片文件
- 误移除文件夹后重新添加即可恢复所有数据（评分 / 收藏保留）

### 2.13 IPC 通信

**通信架构**

```
渲染进程 (React)
  ↓ window.api.* (contextBridge 类型化 API)
preload (ipcRenderer.invoke / ipcRenderer.on)
  ↓ IPC 通道
主进程 (ipcMain.handle)
  ↓ db / scanner / thumbs / exif
数据持久化 (SQLite / 磁盘缓存)
  ↓ scan:progress 事件推送
渲染进程订阅 → 更新 UI
```

**IPC 通道列表**

| 通道 | 方向 | 说明 |
|------|------|------|
| `folders:list` | invoke | 获取所有文件夹列表（含照片计数） |
| `folders:add` | invoke | 弹出目录选择对话框，添加文件夹并自动扫描 |
| `folders:remove` | invoke | 移除文件夹，清理照片记录和缓存 |
| `folders:rescan` | invoke | 重新扫描指定文件夹 |
| `folders:context-menu` | invoke | 弹出文件夹右键菜单 |
| `photos:list` | invoke | 分页查询照片列表（支持过滤 / 排序 / 搜索） |
| `photos:gpsList` | invoke | 查询带 GPS 的照片列表（地图视图） |
| `photos:setRating` | invoke | 设置照片星级 |
| `photos:setFavorite` | invoke | 设置照片收藏状态 |
| `photos:context-menu` | invoke | 弹出照片右键菜单 |
| `scan:progress` | send (主→渲染) | 推送扫描进度更新 |

### 2.14 跨平台与打包

**打包配置**（`electron-builder.yml`）

| 平台 | 格式 | 说明 |
|------|------|------|
| Windows | NSIS | 安装包，可选安装路径 |
| macOS | DMG | 磁盘镜像 |
| Linux | AppImage / snap / deb | 多格式分发 |

- 应用 ID：`com.photobooth`
- 已生成 `dist/photobooth-1.0.0-setup.exe`（Windows 安装包）
- 多平台图标：`build/icon.ico` / `icon.icns` / `icon.png`

**TLS 兼容**

- 强制 TLS 1.2（`ssl-version-max: tls1.2`），绕过高德瓦片服务器 TLS 1.3 握手问题

---

## 三、技术栈一览

| 层 | 选型 | 版本 | 用途 |
|---|---|---|---|
| 桌面壳 | Electron | 39 | 跨平台桌面应用容器 |
| 脚手架 | electron-vite | ^7.2.6（Vite 7） | 三段式构建（main / preload / renderer） |
| 打包 | electron-builder | — | 多平台安装包生成 |
| UI 框架 | React | ^19.2.1 | 渲染进程 UI |
| 语言 | TypeScript | 5.9 | 全量类型安全 |
| 面板布局 | react-resizable-panels | ^4.12.2 | 可拖拽侧边栏 |
| 图像处理 | sharp | — | 缩略图生成 / 格式转换 |
| EXIF 解析 | exifr | — | EXIF / GPS 元数据提取 |
| HEIC 解码 | heic-decode | — | HEIC/HEIF 格式解码 |
| 数据库 | better-sqlite3 | ^13.0.3 | 同步 SQLite，WAL 模式 |
| 地图 | react-leaflet + leaflet | 5 / — | 地图渲染 |
| 地图聚簇 | leaflet.markercluster | — | marker 密集时聚合 |
| 代码规范 | ESLint 9 + Prettier | — | flat config，TS + React hooks |
| 调试 | VSCode launch.json | — | 主进程 + 渲染进程联合调试 |

---

## 四、项目结构

```
Photobooth/
├── src/
│   ├── main/                    # 主进程
│   │   ├── index.ts             # 应用入口：窗口创建、初始化、TLS 配置
│   │   ├── db.ts                # SQLite 建表、CRUD、增量扫描支持、GPS 查询
│   │   ├── scanner.ts           # 递归扫描、并发池、进度推送、增量、清理
│   │   ├── thumbs.ts            # 缩略图生成、HEIC 解码、预览缓存、LRU 清理
│   │   ├── exif.ts              # EXIF 解析、DMS 转换、日期兼容
│   │   ├── protocols.ts         # thumbs:// 和 photo:// 自定义协议
│   │   └── ipc.ts               # IPC handlers：文件夹/照片 CRUD + 右键菜单
│   ├── preload/
│   │   ├── index.ts             # contextBridge 类型化 API 暴露
│   │   └── global.d.ts          # Window 类型声明
│   ├── shared/
│   │   └── types.ts             # 主进程与渲染进程共享类型定义
│   └── renderer/
│       ├── index.html           # HTML 入口（CSP 策略）
│       └── src/
│           ├── main.tsx         # React 入口
│           ├── App.tsx          # 根组件：状态管理、面板布局、视图切换
│           ├── assets/
│           │   ├── base.css     # 基础样式（CSS 变量、暗色主题）
│           │   └── main.css     # 主样式（侧边栏/网格/地图/Lightbox）
│           ├── components/
│           │   ├── Sidebar.tsx       # 侧边栏：多文件夹管理、扫描进度
│           │   ├── PhotoGrid.tsx    # 照片网格：无限滚动、角标、右键菜单
│           │   ├── MapView.tsx      # 地图视图：聚簇、底图切换、坐标纠偏
│           │   ├── Lightbox.tsx     # 大图预览：缩放、平移、键盘、EXIF 详情
│           │   └── RatingStars.tsx # 星级评分控件
│           └── utils/
│               ├── coord.ts        # WGS-84 → GCJ-02 火星坐标转换
│               └── format.ts      # 日期/字节大小格式化
├── docs/
│   ├── TECHNICAL_PLAN.md       # 技术方案文档
│   └── FEATURE_LIST.md         # 本功能清单
├── build/                      # electron-builder 构建资源（图标/权限）
├── resources/                  # 应用图标
├── electron.vite.config.ts     # electron-vite 配置
├── electron-builder.yml        # 打包配置
├── package.json
└── tsconfig.json / tsconfig.node.json / tsconfig.web.json
```

---

## 五、里程碑状态

| 里程碑 | 内容 | 状态 |
|--------|------|------|
| M1 | 多文件夹管理 + 网格预览 | ✅ 完成 |
| M2 | EXIF 详情 + 星级收藏 + 过滤排序 | ✅ 完成 |
| M3 | 地图视图 + 聚簇 + 底图切换 | ✅ 完成 |
| M4 | HEIC 缩略图、搜索、增量扫描、打包分发 | ✅ 完成 |

---

## 六、已知限制

- 地图瓦片需联网加载（OSM 在部分网络环境下可能需代理，可切换 ArcGIS / 高德底图）
- sharp 不带 libheif 支持，HEIC 解码依赖 heic-decode（WASM）库
- 增量扫描依赖文件 mtime + size，文件内容变化但 mtime 未变时不会被重新处理

---

## 七、性能优化

| 优化项 | 实现方式 |
|--------|----------|
| 增量扫描 | 文件 mtime + size 比对，未变化文件跳过 EXIF / 缩略图处理 |
| 并发处理 | 4 线程并发池处理扫描队列 |
| 分页加载 | 每页 120 张，IntersectionObserver 触发加载 |
| 缩略图缓存 | 512px JPEG，文件路径 SHA-1 命名，缺失自动重建 |
| 预览缓存 LRU | 大图预览缓存上限 200MB，超限按 mtime 从旧到新删除 |
| 请求竞态控制 | loadSeq 序号机制，快速切换文件夹时丢弃过期请求 |
| 搜索防抖 | 输入停止 300ms 后触发查询 |
| 聚簇分块加载 | markercluster `chunkedLoading: true` |
| 预览转码去重 | 同一文件并发转码复用同一 Promise |
| 缓存清理节流 | 最多 30s 检查一次，并发复用同一清理任务 |

> AI生成