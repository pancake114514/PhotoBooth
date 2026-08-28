// 渲染进程与主进程共享的类型定义

export interface Folder {
  id: number
  path: string
  name: string
  photoCount: number
}

export interface Photo {
  id: number
  folderId: number
  path: string
  filename: string
  size: number | null
  width: number | null
  height: number | null
  format: string | null
  /** 缩略图缓存文件名（相对缓存目录）；null 表示生成失败（如 HEIC），前端回退到原图 */
  thumbPath: string | null
  takenAt: number | null
  make: string | null
  model: string | null
  lens: string | null
  fnumber: number | null
  iso: number | null
  exposure: string | null
  focalLength: number | null
  gpsLat: number | null
  gpsLng: number | null
  gpsAlt: number | null
  rating: number
  favorite: number
}

export type ScanPhase = 'walking' | 'processing' | 'done' | 'error'

export interface ScanProgress {
  folderId: number
  phase: ScanPhase
  done: number
  total: number
  message?: string
}

/** 列表过滤：全部 / 仅收藏 / 评分 ≥ minRating */
export type PhotoFilter = 'all' | 'favorite' | 'rated'

/** 列表排序 */
export type SortBy = 'taken_desc' | 'taken_asc' | 'filename'

export interface PhotoListOptions {
  filter?: PhotoFilter
  minRating?: number
  sortBy?: SortBy
  /** 文件名/路径关键字搜索 */
  search?: string
}

export interface PhotoPage {
  photos: Photo[]
  total: number
}

/** 地图视图数据：带 GPS 的照片列表 + 文件夹照片总数 */
export interface GpsPhotoList {
  photos: Photo[]
  total: number
}

/** preload 暴露给渲染进程的 API 形状 */
export interface Api {
  folders: {
    list: () => Promise<Folder[]>
    add: () => Promise<Folder | null>
    remove: (id: number) => Promise<void>
    rescan: (id: number) => Promise<void>
    cancelScan: (id: number) => Promise<void>
    /** 右键相册：弹出系统上下文菜单（在资源管理器中打开） */
    showContextMenu: (path: string, x: number, y: number) => Promise<void>
  }
  photos: {
    list: (
      folderId: number,
      offset: number,
      limit: number,
      opts?: PhotoListOptions
    ) => Promise<PhotoPage>
    gpsList: (folderId: number, opts?: PhotoListOptions) => Promise<GpsPhotoList>
    setRating: (id: number, rating: number) => Promise<void>
    setFavorite: (id: number, favorite: boolean) => Promise<void>
    /** 右键照片：弹出系统上下文菜单（在资源管理器中显示 / 用系统图片浏览器打开） */
    showContextMenu: (path: string, x: number, y: number) => Promise<void>
  }
  /** 缩略图缓存文件名 → 协议 URL */
  thumbUrl: (thumbPath: string) => string
  /** 照片绝对路径 → 协议 URL */
  photoUrl: (path: string) => string
  onScanProgress: (cb: (p: ScanProgress) => void) => () => void
}
