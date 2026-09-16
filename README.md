
# Photobooth

桌面端相册管理工具：主流格式图像预览、EXIF 信息读取（含位置与设备信息）、星级与收藏，以及在地图上展示照片位置（iOS 相册式体验）。

基于 **Electron + React + TypeScript** 构建。

## 功能特性

- **多文件夹相册**：侧边栏管理多个照片文件夹，独立添加 / 移除 / 重新扫描，各自显示照片数量；侧边栏可折叠成窄条、拖动分隔条调整宽度
- **网格预览**：自动生成缩略图缓存（sharp），无限滚动懒加载；支持 HEIC/HEIF（heic-decode 解码）；收起侧边栏时窗口最小宽度可平铺三列缩略图
- **EXIF 信息**：拍摄时间、设备（厂商 / 型号）、镜头、焦距、光圈、快门、ISO、尺寸、文件大小、完整路径
- **星级与收藏**：大图预览中设置 0-5 星与收藏，网格角标展示；数据存 SQLite 外置库，重新扫描不丢失；评分乐观更新，写入失败自动回滚并提示
- **过滤排序**：按收藏 / 星级过滤，按拍摄时间 / 文件名排序
- **搜索**：按文件名 / 路径关键字模糊搜索（防抖输入，网格与地图视图均生效）
- **状态记忆**：窗口尺寸 / 位置与最大化状态、侧边栏折叠、当前视图与过滤 / 排序条件自动持久化，重启后恢复
- **地图视图**（iOS 相册式）：
  - 照片位置以圆形缩略图 marker 展示，密集时自动聚簇
  - 支持 **ArcGIS / 高德 / 高德卫星 / OSM** 四种底图一键切换
  - 国内底图（GCJ-02 火星坐标）自动对照片 WGS-84 坐标纠偏
  - 点击 marker 直接打开照片大图
- **大图预览**：
  - 右侧信息栏（可收起），**Tab 键快速切换 EXIF 信息面板**
  - 键盘 ←/→ 翻页；左右切换自动跨页加载更多，首尾按钮禁用提示
  - **双击或工具栏按钮进入全屏**；全屏时按 Esc / 点击 × / 点击背景先退出全屏回到预览，再次操作才关闭
  - 从地图打开时可在全部带位置照片间切换
  - **Ctrl + 滚轮缩放**（1~8 倍），缩放中心跟随鼠标，放大后拖拽平移
  - **右键菜单**支持复制图片到剪贴板 / 复制文件路径（复制图片时自动应用 EXIF 方向修复旋转）

## 技术栈

| 层       | 选型                                                              |
| -------- | ----------------------------------------------------------------- |
| 桌面壳   | Electron 39（electron-vite）                                      |
| UI       | React 19 + TypeScript（react-resizable-panels 可拖拽面板）        |
| 图像处理 | sharp（缩略图）+ exifr（EXIF/GPS 解析）+ heic-decode（HEIC）      |
| 存储     | better-sqlite3（索引库，外置管理，不改动原文件）                  |
| 地图     | react-leaflet + leaflet.markercluster + OSM/高德/ArcGIS 瓦片      |
| 构建     | electron-builder（Windows NSIS / macOS DMG / Linux AppImage+deb） |
| CI/CD    | GitHub Actions（自动类型检查 + 多平台打包发布，Node 22）         |

## 快速开始

```bash
# 安装依赖（国内网络建议配置 Electron 镜像，见 .npmrc）
npm install

# 开发模式（热更新）
npm run dev

# 类型检查
npm run typecheck

# Lint 检查
npm run lint

# 打包各平台安装包
npm run build:win      # Windows NSIS 安装包
npm run build:mac      # macOS DMG（x64 + arm64）
npm run build:linux    # Linux AppImage + deb
```

> 首次使用：点击侧边栏"＋"添加照片文件夹，应用自动扫描并建立索引。

## 项目结构

```
src/
├─ main/          # 主进程：窗口、SQLite、扫描器、缩略图、EXIF、自定义协议、IPC
├─ preload/       # contextBridge 类型化 API
├─ renderer/      # React UI：网格 / 地图 / 大图预览 / 侧边栏
└─ shared/        # 主进程与渲染进程共享类型
docs/
├─ TECHNICAL_PLAN.md       # 技术方案
├─ FEATURE_LIST.md          # 功能清单
└─ CODE_REVIEW.md           # 代码审查报告
.github/workflows/          # CI/CD：自动检查与多平台打包发布
```

## 路线图

- [x] M1 多文件夹管理 + 网格预览
- [x] M2 EXIF 详情 + 星级收藏 + 过滤排序
- [x] M3 地图视图 + 聚簇 + 底图切换
- [x] M4 HEIC 缩略图、搜索、增量扫描、打包分发
- [x] v1.0.1 CI/CD 自动化、macOS Apple Silicon 支持、大图右键菜单与交互优化
- [x] 后续加固：安全加固（渲染进程沙箱、IPC 来源校验、`photo://` 扩展名白名单、单实例锁）+ 状态持久化（窗口 / 侧边栏 / 视图）+ 全屏模式

## 打包分发

| 平台    | 格式           | 架构        |
| ------- | -------------- | ----------- |
| Windows | NSIS 安装包    | x64         |
| macOS   | DMG 磁盘镜像   | x64 + arm64 |
| Linux   | AppImage + deb | x64         |

- GitHub Actions 在推送 tag 时自动构建多平台安装包并发布到 GitHub Releases
- macOS 支持 Apple Silicon（arm64）原生打包

## 安全与数据保障

- 渲染进程沙箱隔离，CSP 显式声明；IPC 通道校验发送方来源，`photo://` 协议限定图像扩展名白名单
- 单实例锁防止多开导致 SQLite / 缩略图缓存竞争
- 扫描 / EXIF / 缩略图生成均有超时控制与并发去重，单文件异常不影响整体扫描
- 外部链接仅允许 http/https 协议打开

## 已知限制

- 地图瓦片需联网加载（OSM 在部分网络环境下可能需代理，可切换 ArcGIS / 高德底图）
- sharp 不带 libheif 支持，HEIC 解码依赖 heic-decode（WASM）库
- 增量扫描依赖文件 mtime + size，文件内容变化但 mtime 未变时不会被重新处理

## 数据安全

- **移除文件夹仅删除应用索引，绝不删除磁盘上的照片文件**：照片始终保留在原位置，误移除后重新添加文件夹即可恢复；需要清理磁盘文件请手动操作。
- 评分 / 收藏存储在 SQLite 外置库，不修改原始照片文件。

## License

[MIT](LICENSE) © 2026 pancake114514
