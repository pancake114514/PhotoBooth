import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Folder,
  Photo,
  PhotoListOptions,
  ScanProgress,
  SortBy
} from '../../shared/types'
import Sidebar from './components/Sidebar'
import PhotoGrid from './components/PhotoGrid'
import MapView from './components/MapView'
import Lightbox from './components/Lightbox'

const PAGE_SIZE = 120

interface FilterOption {
  id: string
  label: string
  filter?: 'all' | 'favorite' | 'rated'
  minRating?: number
}

const FILTERS: FilterOption[] = [
  { id: 'all', label: '全部', filter: 'all' },
  { id: 'favorite', label: '♥ 收藏', filter: 'favorite' },
  { id: 'rated1', label: '★ ≥ 1', filter: 'rated', minRating: 1 },
  { id: 'rated3', label: '★★★ ≥ 3', filter: 'rated', minRating: 3 },
  { id: 'rated4', label: '★★★★ ≥ 4', filter: 'rated', minRating: 4 }
]

type View = 'grid' | 'map'

interface LightboxState {
  photos: Photo[]
  index: number
}

function App(): React.JSX.Element {
  const [folders, setFolders] = useState<Folder[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [view, setView] = useState<View>('grid')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [gpsPhotos, setGpsPhotos] = useState<Photo[]>([])
  const [gpsTotal, setGpsTotal] = useState(0)
  const [scanMap, setScanMap] = useState<Record<number, ScanProgress>>({})
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)
  const [filterId, setFilterId] = useState('all')
  const [sortBy, setSortBy] = useState<SortBy>('taken_desc')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  // 搜索防抖：停止输入 300ms 后生效
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const loadSeq = useRef(0) // 请求序号，防止快速切换时的竞态
  const activeIdRef = useRef<number | null>(null)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])
  const viewRef = useRef<View>(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])

  const opts = useMemo<PhotoListOptions>(() => {
    const f = FILTERS.find((x) => x.id === filterId) ?? FILTERS[0]
    return { filter: f.filter, minRating: f.minRating, sortBy, search: search || undefined }
  }, [filterId, sortBy, search])
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  }, [opts])

  const refreshFolders = useCallback(async () => {
    const list = await window.api.folders.list()
    setFolders(list)
    setActiveId((cur) =>
      cur != null && list.some((f) => f.id === cur) ? cur : (list[0]?.id ?? null)
    )
  }, [])

  // 初始加载：微任务排程，避免 effect 内同步 setState
  useEffect(() => {
    const id = setTimeout(() => {
      void refreshFolders()
    }, 0)
    return () => clearTimeout(id)
  }, [refreshFolders])

  const loadPage = useCallback(
    async (folderId: number, offset: number, append: boolean) => {
      const seq = ++loadSeq.current
      setLoading(true)
      try {
        const page = await window.api.photos.list(folderId, offset, PAGE_SIZE, optsRef.current)
        if (seq !== loadSeq.current) return // 已被更新的请求取代
        setTotal(page.total)
        setPhotos((prev) => (append ? [...prev, ...page.photos] : page.photos))
      } finally {
        if (seq === loadSeq.current) setLoading(false)
      }
    },
    []
  )

  const loadGps = useCallback(async (folderId: number) => {
    const res = await window.api.photos.gpsList(folderId, optsRef.current)
    setGpsPhotos(res.photos)
    setGpsTotal(res.total)
  }, [])

  // 切换文件夹 / 过滤 / 排序 / 搜索 / 视图 → 重新加载
  useEffect(() => {
    if (activeId == null) return
    if (view === 'map') {
      void loadGps(activeId)
    } else {
      setPhotos([])
      setTotal(0)
      void loadPage(activeId, 0, false)
    }
  }, [activeId, filterId, sortBy, search, view, loadPage, loadGps])

  // 订阅扫描进度
  useEffect(() => {
    const off = window.api.onScanProgress((p) => {
      setScanMap((m) => ({ ...m, [p.folderId]: p }))
      if (p.phase === 'done' || p.phase === 'error') {
        void refreshFolders() // 更新文件夹照片计数
        if (p.folderId === activeIdRef.current) {
          if (viewRef.current === 'map') {
            void loadGps(p.folderId)
          } else {
            setPhotos([])
            setTotal(0)
            void loadPage(p.folderId, 0, false)
          }
        }
      }
    })
    return off
  }, [refreshFolders, loadPage, loadGps])

  const loadMore = useCallback(() => {
    if (loading || activeId == null) return
    if (photos.length >= total) return
    void loadPage(activeId, photos.length, true)
  }, [loading, activeId, photos.length, total, loadPage])

  const reloadActive = useCallback(() => {
    const id = activeIdRef.current
    if (id == null) return
    if (viewRef.current === 'map') {
      void loadGps(id)
    } else {
      setPhotos([])
      setTotal(0)
      void loadPage(id, 0, false)
    }
  }, [loadPage, loadGps])

  // 当前过滤条件下该照片是否仍可见
  const matchesFilter = useCallback((p: Photo): boolean => {
    const o = optsRef.current
    if (o.filter === 'favorite') return p.favorite === 1
    if (o.filter === 'rated') return p.rating >= (o.minRating ?? 1)
    return true
  }, [])

  /** 评分/收藏变更：同步更新网格、地图、Lightbox 三处数据 */
  const applyMeta = useCallback(
    (photo: Photo, patch: Partial<Photo>) => {
      const updated = { ...photo, ...patch }
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? updated : p)))
      setGpsPhotos((prev) => prev.map((p) => (p.id === photo.id ? updated : p)))
      setLightbox((s) =>
        s ? { ...s, photos: s.photos.map((p) => (p.id === photo.id ? updated : p)) } : s
      )
      if (!matchesFilter(updated)) reloadActive() // 不再满足过滤条件 → 从列表消失
    },
    [matchesFilter, reloadActive]
  )

  const handleSetRating = (photo: Photo, rating: number): void => {
    applyMeta(photo, { rating })
    void window.api.photos.setRating(photo.id, rating)
  }

  const handleSetFavorite = (photo: Photo, favorite: boolean): void => {
    applyMeta(photo, { favorite: favorite ? 1 : 0 })
    void window.api.photos.setFavorite(photo.id, favorite)
  }

  const handleAdd = async (): Promise<void> => {
    const folder = await window.api.folders.add()
    if (folder) {
      await refreshFolders()
      setActiveId(folder.id)
    }
  }

  const handleRemove = async (id: number): Promise<void> => {
    await window.api.folders.remove(id)
    await refreshFolders()
  }

  const handleRescan = (id: number): void => {
    void window.api.folders.rescan(id)
  }

  const activeFolder = folders.find((f) => f.id === activeId) ?? null
  const activeScan = activeId != null ? scanMap[activeId] : undefined
  const isScanning =
    activeScan != null && (activeScan.phase === 'walking' || activeScan.phase === 'processing')

  return (
    <div className="app">
      <Sidebar
        folders={folders}
        activeId={activeId}
        scanMap={scanMap}
        onSelect={setActiveId}
        onAdd={handleAdd}
        onRemove={handleRemove}
      />
      <main className="main">
        <header className="toolbar">
          <h1>{activeFolder ? activeFolder.name : '照片'}</h1>
          <div className="toolbar-controls">
            <div className="view-switch">
              <button
                className={view === 'grid' ? 'on' : ''}
                onClick={() => setView('grid')}
                title="照片网格"
              >
                照片
              </button>
              <button
                className={view === 'map' ? 'on' : ''}
                onClick={() => setView('map')}
                title="地图视图"
              >
                地图
              </button>
            </div>
            <input
              className="btn search-input"
              type="text"
              placeholder="搜索文件名…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <select
              className="btn select"
              value={filterId}
              onChange={(e) => {
                setLightbox(null)
                setFilterId(e.target.value)
              }}
              title="过滤"
            >
              {FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              className="btn select"
              value={sortBy}
              disabled={view !== 'grid'}
              onChange={(e) => {
                setLightbox(null)
                setSortBy(e.target.value as SortBy)
              }}
              title={view === 'grid' ? '排序' : '排序仅对照片网格生效'}
            >
              <option value="taken_desc">最新优先</option>
              <option value="taken_asc">最旧优先</option>
              <option value="filename">按文件名</option>
            </select>
          </div>
          <div className="toolbar-info">
            {isScanning && activeScan && (
              <span className="scan-status">
                {activeScan.phase === 'walking'
                  ? '正在扫描…'
                  : `扫描中 ${activeScan.done}/${activeScan.total}`}
              </span>
            )}
            <span>{view === 'map' ? gpsTotal : total} 张</span>
            {activeFolder && (
              <button
                className="btn"
                disabled={isScanning}
                onClick={() => handleRescan(activeFolder.id)}
              >
                重新扫描
              </button>
            )}
          </div>
        </header>
        {view === 'grid' ? (
          <PhotoGrid
            photos={photos}
            total={total}
            loading={loading}
            onLoadMore={loadMore}
            onOpen={(i) => setLightbox({ photos, index: i })}
          />
        ) : (
          <MapView
            photos={gpsPhotos}
            total={gpsTotal}
            onOpenPhoto={(p) => setLightbox({ photos: [p], index: 0 })}
          />
        )}
      </main>
      {lightbox != null && lightbox.photos[lightbox.index] != null && (
        <Lightbox
          photos={lightbox.photos}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(i) => setLightbox((s) => (s ? { ...s, index: i } : s))}
          onSetRating={handleSetRating}
          onSetFavorite={handleSetFavorite}
        />
      )}
    </div>
  )
}

export default App
