# Photobooth

桌面端相册管理工具：主流格式图像预览、EXIF 信息读取（含位置与设备信息）、星级与收藏，以及在地图上展示照片位置（iOS 相册式体验）。

基于 **Electron + React + TypeScript** 构建。

## 功能特性

- **多文件夹相册**：侧边栏管理多个照片文件夹，独立添加 / 移除 / 重新扫描，各自显示照片数量
- **网格预览**：自动生成缩略图缓存（sharp），无限滚动懒加载；支持 HEIC/HEIF（libheif 解码）
- **EXIF 信息**：拍摄时间、设备（厂商 / 型号）、镜头、焦距、光圈、快门、ISO、尺寸、文件大小、完整路径
- **星级与收藏**：大图预览中设置 0-5 星与收藏，网格角标展示；数据存 SQLite 外置库，重新扫描不丢失
- **过滤排序**：按收藏 / 星级过滤，按拍摄时间 / 文件名排序
- **搜索**：按文件名 / 路径关键字模糊搜索（防抖输入，网格与地图视图均生效）
- **地图视图**（iOS 相册式）：
  - 照片位置以圆形缩略图 marker 展示，密集时自动聚簇
  - 支持 **ArcGIS / 高德 / 高德卫星 / OSM** 四种底图一键切换
  - 国内底图（GCJ-02 火星坐标）自动对照片 WGS-84 坐标纠偏
  - 点击 marker 直接打开照片大图
- **大图预览**：右侧信息栏（可收起）、键盘 ←/→ 翻页、Esc 关闭

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面壳 | Electron 39（electron-vite） |
| UI | React 19 + TypeScript |
| 图像处理 | sharp（缩略图）+ exifr（EXIF/GPS 解析） |
| 存储 | better-sqlite3（索引库，外置管理，不改动原文件） |
| 地图 | react-leaflet + leaflet.markercluster + OSM/高德/ArcGIS 瓦片 |

## 快速开始

```bash
# 安装依赖（国内网络建议配置 Electron 镜像，见 .npmrc）
npm install

# 开发模式（热更新）
npm run dev

# 类型检查
npm run typecheck

# 打包 Windows 安装包
npm run build:win
```

> 首次使用：点击侧边栏"＋"添加照片文件夹，应用自动扫描并建立索引。

## 项目结构

```
src/
├─ main/          # 主进程：窗口、SQLite、扫描器、缩略图、EXIF、自定义协议、IPC
├─ preload/       # contextBridge 类型化 API
├─ renderer/      # React UI：网格 / 地图 / 大图预览 / 侧边栏
└─ shared/        # 主进程与渲染进程共享类型
docs/TECHNICAL_PLAN.md   # 技术方案
```

## 路线图

- [x] M1 多文件夹管理 + 网格预览
- [x] M2 EXIF 详情 + 星级收藏 + 过滤排序
- [x] M3 地图视图 + 聚簇 + 底图切换
- [x] M4 HEIC 缩略图、搜索、增量扫描、打包分发

## 已知限制

- 地图瓦片需联网加载（OSM 在部分网络环境下可能需代理，可切换 ArcGIS / 高德底图）
- 移除文件夹仅删除索引，不删除磁盘文件
