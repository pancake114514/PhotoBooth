# Photobooth 技术方案

桌面端相册管理工具：主流格式预览、EXIF 读取（位置/设备信息）、星级与收藏、地图显示照片位置（iOS 相册式体验）。

**已确认的选型**：Electron + React / SQLite 外置库 / 多底图（默认高德，含 GCJ-02 纠偏）/ v1 不支持 RAW。

## 1. 技术栈

| 层       | 选型                                     | 说明                                                                                                      |
| -------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 桌面壳   | Electron（electron-vite 脚手架）         | 主进程负责文件扫描、缩略图、SQLite、协议、IPC                                                             |
| UI       | React + TypeScript                       | 网格 / 详情面板 / 地图视图                                                                                |
| 图像解码 | 浏览器原生 + sharp（主进程）             | 原生支持 JPEG/PNG/WebP/AVIF/GIF；HEIC 由 Chromium 解码（无缩略图时回退原图）；sharp 生成缩略图（libvips） |
| EXIF     | exifr                                    | TS 友好，支持 JPEG/TIFF/HEIC 容器、GPS、异步解析                                                          |
| 存储     | better-sqlite3                           | 同步 API、性能好；原生模块需 electron-rebuild（ABI 匹配 Electron）                                        |
| 地图     | react-leaflet + leaflet.markercluster    | 多底图：高德 / 高德卫星 / OSM / ArcGIS                                                                    |
| 安全     | contextIsolation + preload contextBridge | 渲染进程不直接触碰 Node                                                                                   |

## 2. 项目结构

```
photobooth/
├─ electron.vite.config.ts
├─ src/
│  ├─ main/           # 主进程
│  │  ├─ index.ts     # 窗口生命周期、应用数据初始化
│  │  ├─ db.ts        # SQLite 建表与查询（folders/photos/过滤排序/GPS）
│  │  ├─ scanner.ts   # 递归扫描（并发池 + 进度推送 + 删除清理）
│  │  ├─ thumbs.ts    # 缩略图生成与缓存
│  │  ├─ exif.ts      # EXIF 提取（设备/GPS/拍摄时间）
│  │  ├─ protocols.ts # thumbs:// photo:// 自定义协议
│  │  └─ ipc.ts       # IPC handlers
│  ├─ preload/        # contextBridge 暴露类型化 API
│  ├─ shared/types.ts # 主进程与渲染进程共享类型
│  └─ renderer/       # React UI
│     ├─ components/  # Sidebar / PhotoGrid / Lightbox / MapView / RatingStars
│     └─ utils/       # format / coord（GCJ-02 纠偏）
└─ docs/
```

IPC 设计：`invoke`（选择文件夹、扫描、缩略图、EXIF、更新评分/收藏、查询）+ 事件推送（`scan:progress`）。

## 3. 数据模型（SQLite）

```sql
CREATE TABLE folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, added_at INTEGER NOT NULL
);
CREATE TABLE photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  path TEXT NOT NULL UNIQUE,      -- 绝对路径（唯一）
  filename TEXT NOT NULL,
  size INTEGER, mtime INTEGER,    -- mtime 用于扫描增量判定
  width INTEGER, height INTEGER,
  format TEXT,                    -- jpeg/png/webp/heic/avif/gif/bmp/tif...
  thumb_path TEXT,                -- 缓存缩略图文件名（sha1 哈希）
  taken_at INTEGER,               -- 拍摄时间（EXIF）
  make TEXT, model TEXT, lens TEXT,
  fnumber REAL, iso INTEGER,
  exposure TEXT, focal_length INTEGER,
  gps_lat REAL, gps_lng REAL, gps_alt REAL,
  rating INTEGER NOT NULL DEFAULT 0,   -- 0-5 星
  favorite INTEGER NOT NULL DEFAULT 0, -- 收藏
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_photos_folder ON photos(folder_id);
CREATE INDEX idx_photos_taken  ON photos(taken_at);
CREATE INDEX idx_photos_gps    ON photos(gps_lat, gps_lng);
CREATE INDEX idx_photos_rating ON photos(rating, favorite);
```

要点：星级/收藏存库不动原文件；重扫（upsert ON CONFLICT）**不覆盖** rating/favorite；缩略图缓存于应用数据目录（按路径 sha1 命名）；扫描结束清理已删除文件。

## 4. 功能模块

- **多文件夹管理**：侧边栏添加/移除/切换/重扫多个文件夹，各自独立计数与扫描进度，按 `folder_id` 隔离。
- **扫描**：递归遍历（跳过隐藏与 node_modules 等），图片扩展名过滤，并发池（4 线程）逐文件 stat→EXIF→缩略图→入库，节流进度推送，结束后清理已删除文件。
- **预览**：网格懒加载缩略图（无限滚动），大图 Lightbox（键盘上下张/关闭）。
- **EXIF 详情**：右侧信息栏展示拍摄时间、设备、镜头、焦距/光圈/快门/ISO、尺寸、文件大小、GPS（经纬度/海拔）、路径。
- **评分/收藏**：详情栏星标 + 收藏，网格角标显示；支持按收藏/星级过滤、按时间/文件名排序；过滤条件下失效照片自动移出视图。
- **地图**：照片/地图双视图切换；缩略图圆形 marker + 聚簇（markercluster）；自适应视野；点击定位打开大图；无 GPS 照片计数提示。
- **多底图**：右下角选项卡高德/卫星/OSM/ARCGIS；默认高德。高德系（GCJ-02）自动将照片 WGS-84 坐标纠偏后定位；切底图保持视野不跳图。

## 5. 里程碑

- **[x] M1** 脚手架 + 多文件夹选择 + 全量扫描 + 网格缩略图预览 ✅
- **[x] M2** EXIF 详情面板 + 星级/收藏 + 过滤排序 ✅
- **[x] M3** 地图视图 + 聚簇 + 照片定位 + 多底图 ✅
- **M4** HEIC 缩略图完善、搜索、性能优化、打包分发（electron-builder）

## 6. 风险备忘 / 已知边界

- better-sqlite3 原生模块需 electron-rebuild 匹配 Electron ABI。
- 大目录首次扫描耗时 → 后台任务 + 增量扫描（mtime/size 判定）+ 并发池。
- OSM / ArcGIS 为海外瓦片服务，网络受限时加载慢；高德在国内直连快。
- 无 GPS 照片不上图、单独计数提示。
- 移除文件夹仅删索引，不删磁盘文件。
- HEIC 现通过 Chromium 原图解码显示，缩略图由 sharp 生成会失败（libvips 缺 libheif）——M4 可加 libheif 改用缩略图。
- 后续加 RAW 时引入 rawler（Rust）或 libraw 绑定，复杂度明显上升。
