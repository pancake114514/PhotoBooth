# Photobooth 技术方案

桌面端相册管理工具：主流格式预览、EXIF 读取（位置/设备信息）、星级与收藏、地图显示照片位置（iOS 相册式体验）。

**已确认的选型**：Electron + React / SQLite 外置库 / 在线 OSM 底图 / v1 不支持 RAW。

## 1. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 桌面壳 | Electron（electron-vite 脚手架） | 主进程负责文件扫描、缩略图、SQLite、IPC |
| UI | React + TypeScript | 网格瀑布流 / 详情面板 / 地图视图 |
| 图像解码 | 浏览器原生 + sharp（主进程） | 原生支持 JPEG/PNG/WebP/AVIF/GIF；HEIC 由 Chromium 解码；sharp 生成缩略图（libvips） |
| EXIF | exifr | TS 友好，支持 JPEG/TIFF/HEIC 容器、GPS、异步解析 |
| 存储 | better-sqlite3 | 同步 API、性能好；原生模块需 electron-rebuild |
| 地图 | react-leaflet + leaflet.markercluster | 在线 OSM 瓦片（WGS-84 与照片 GPS 无偏移） |
| 安全 | contextIsolation + preload contextBridge | 渲染进程不直接触碰 Node |

## 2. 项目结构

```
photobooth/
├─ electron.vite.config.ts
├─ src/
│  ├─ main/          # 主进程
│  │  ├─ index.ts    # 窗口生命周期
│  │  ├─ db.ts       # SQLite 初始化与查询
│  │  ├─ scanner.ts  # 全量/增量扫描
│  │  ├─ thumbs.ts   # 缩略图生成与缓存
│  │  └─ exif.ts     # EXIF 提取
│  ├─ preload/       # contextBridge 暴露类型化 API
│  └─ renderer/      # React UI
│     ├─ pages/      # GridPage / MapPage
│     ├─ components/ # 详情面板、聚簇地图、评分控件
│     └─ store/      # 状态管理
└─ docs/
```

IPC 设计：`invoke`（选择文件夹、扫描、缩略图、EXIF、更新评分/收藏、查询）+ 事件推送（`scan-progress`）。

## 3. 数据模型（SQLite）

```sql
CREATE TABLE photos (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,      -- 绝对路径（唯一）
  dir TEXT NOT NULL,
  filename TEXT NOT NULL,
  size INTEGER,
  mtime INTEGER,                  -- 增量扫描判定
  width INTEGER, height INTEGER,
  format TEXT,                    -- jpeg/png/webp/heic/avif/gif
  thumb_path TEXT,                -- 缓存缩略图路径
  taken_at INTEGER,               -- 拍摄时间（EXIF）
  make TEXT, model TEXT, lens TEXT,
  fnumber REAL, iso INTEGER,
  exposure TEXT, focal_length INTEGER,
  gps_lat REAL, gps_lng REAL, gps_alt REAL,
  rating INTEGER DEFAULT 0,       -- 0-5 星
  favorite INTEGER DEFAULT 0,     -- 收藏
  created_at INTEGER
);
CREATE INDEX idx_photos_dir    ON photos(dir);
CREATE INDEX idx_photos_taken  ON photos(taken_at);
CREATE INDEX idx_photos_gps    ON photos(gps_lat, gps_lng);
CREATE INDEX idx_photos_rating ON photos(rating, favorite);
```

要点：星级/收藏存库不动原文件；`mtime`+`size` 变化判定增量扫描；缩略图缓存于应用数据目录（按路径哈希命名）。

## 4. 功能模块

- **扫描**：首次全量（后台任务 + 进度推送），之后增量；过滤常见图片扩展名。
- **预览**：网格懒加载缩略图（LRU 缓存），点击大图预览。
- **EXIF 详情**：拍摄时间、设备（Make/Model/镜头）、参数（光圈/ISO/快门/焦距）、GPS（经纬度/海拔）。
- **评分/收藏**：详情面板星标操作，支持按评分/收藏过滤排序。
- **地图**：网格/地图双视图；位置聚簇（markercluster），点簇放大散开；点击照片在地图定位；无 GPS 照片单独计数。

## 5. 里程碑

- **M1** 脚手架 + 文件夹选择 + 全量扫描 + JPEG 网格缩略图预览
- **M2** EXIF 详情面板 + 星级/收藏 + 过滤排序
- **M3** 地图视图 + 聚簇 + 照片定位
- **M4** HEIC 完善、搜索、性能与体验优化

## 6. 风险备忘

- better-sqlite3 原生模块需 electron-rebuild 匹配 Electron ABI。
- 大目录首次扫描耗时 → 后台任务 + 增量扫描。
- OSM 瓦片需联网；后续如需国内底图，做 WGS-84 → GCJ-02 纠偏。
- 后续加 RAW 时引入 rawler（Rust）或 libraw 绑定，复杂度明显上升。
