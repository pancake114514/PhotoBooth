import { useCallback, useEffect, useRef, useState } from 'react'
import type { Photo } from '../../../shared/types'
import { formatBytes, formatDateTime } from '../utils/format'
import RatingStars from './RatingStars'

interface Props {
  photos: Photo[]
  index: number
  /** 当前数据源的照片总数（网格分页场景下大于已加载 photos.length 时仍可继续加载） */
  total: number
  /** 翻到已加载末尾时触发加载更多（地图等全量数据场景不传） */
  onLoadMore?: () => void
  onClose: () => void
  onNavigate: (index: number) => void
  onSetRating: (photo: Photo, rating: number) => void
  onSetFavorite: (photo: Photo, favorite: boolean) => void
}

/** 缩放模式 */
type FitMode = 'fit' | 'actual'

function Lightbox({
  photos,
  index,
  total,
  onLoadMore,
  onClose,
  onNavigate,
  onSetRating,
  onSetFavorite
}: Props): React.JSX.Element {
  const photo = photos[index]
  const [sideOpen, setSideOpen] = useState(true)
  // 大图缩放：1 = 默认浏览比例（最小值），Ctrl+滚轮 上=放大 / 下=缩小
  const [zoom, setZoom] = useState(1)
  // 缩放中心（以鼠标指针为基准），用百分比表示在舞台内的位置
  const [zoomOrigin, setZoomOrigin] = useState<{ x: number; y: number }>({ x: 50, y: 50 })
  const stageRef = useRef<HTMLDivElement>(null)
  const MIN_ZOOM = 1
  const MAX_ZOOM = 8
  const ZOOM_STEP = 1.1
  // 拖动平移偏移量（相对默认位置，像素）
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  // 适应模式：fit = 适应窗口，actual = 原始尺寸（1:1 像素）
  const [fitMode, setFitMode] = useState<FitMode>('fit')
  // 幻灯片播放
  const [slideshow, setSlideshow] = useState(false)
  const SLIDESHOW_INTERVAL = 3000 // 每张 3 秒
  const slideshowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // 全屏状态
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Toast 提示
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 滚轮翻页节流（防止滚轮事件过密）
  const wheelLockRef = useRef(false)

  /** 显示 Toast 提示（2 秒后自动消失） */
  const showToast = useCallback((msg: string): void => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2000)
  }, [])

  // 切图重置缩放与平移
  const resetView = useCallback(() => {
    setZoom(1)
    setZoomOrigin({ x: 50, y: 50 })
    setOffset({ x: 0, y: 0 })
    setDragging(false)
  }, [])

  const prev = useCallback(() => {
    if (index > 0) {
      resetView()
      onNavigate(index - 1)
    }
  }, [index, onNavigate, resetView])

  const next = useCallback(() => {
    if (index < photos.length - 1) {
      resetView()
      onNavigate(index + 1)
    } else if (onLoadMore) {
      onLoadMore() // 已到已加载末尾：请求下一页，加载后继续可翻
    }
  }, [index, photos.length, onNavigate, onLoadMore, resetView])

  // 跳转到第一张 / 最后一张
  const goFirst = useCallback(() => {
    if (index > 0) {
      resetView()
      onNavigate(0)
    }
  }, [index, onNavigate, resetView])

  const goLast = useCallback(() => {
    const last = photos.length - 1
    if (index < last) {
      resetView()
      onNavigate(last)
    }
  }, [index, photos.length, onNavigate, resetView])

  // 末尾且没有更多可加载 → 禁用下一张
  const noMoreNext = index >= photos.length - 1 && (!onLoadMore || photos.length >= total)

  // ===== 幻灯片播放 =====
  const stopSlideshow = useCallback(() => {
    setSlideshow(false)
  }, [])

  // 启动/停止幻灯片定时器
  useEffect(() => {
    if (slideshow) {
      slideshowTimerRef.current = setInterval(() => {
        // 到最后一张时停止播放
        if (index >= photos.length - 1 && (!onLoadMore || photos.length >= total)) {
          stopSlideshow()
        } else {
          next()
        }
      }, SLIDESHOW_INTERVAL)
      return () => {
        if (slideshowTimerRef.current) clearInterval(slideshowTimerRef.current)
      }
    }
    return undefined
  }, [slideshow, index, photos.length, total, onLoadMore, next, stopSlideshow])

  // ===== 切换全屏 =====
  const toggleFullscreen = useCallback(async (): Promise<void> => {
    const newState = await window.api.toggleFullscreen()
    setIsFullscreen(newState)
  }, [])

  // ===== 切换适应模式 =====
  const cycleFitMode = useCallback((): void => {
    setFitMode((cur) => {
      const nextMode: FitMode = cur === 'fit' ? 'actual' : 'fit'
      showToast(nextMode === 'fit' ? '适应窗口' : '原始尺寸 100%')
      if (nextMode === 'fit') {
        resetView()
      }
      return nextMode
    })
  }, [resetView, showToast])

  // ===== 复制图片到剪贴板 =====
  const copyImage = useCallback(async (): Promise<void> => {
    if (!photo) return
    await window.api.copyImage(photo.path)
    showToast('已复制图片到剪贴板')
  }, [photo, showToast])

  // ===== 复制文件路径到剪贴板 =====
  const copyPath = useCallback(async (): Promise<void> => {
    if (!photo) return
    await window.api.copyText(photo.path)
    showToast('已复制文件路径')
  }, [photo, showToast])

  // ===== 键盘事件 =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // 幻灯片播放中：任意键停止
      if (slideshow) {
        stopSlideshow()
        return
      }

      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          prev()
          break
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
          e.preventDefault()
          next()
          break
        case 'PageUp':
          e.preventDefault()
          prev()
          break
        case 'Home':
          goFirst()
          break
        case 'End':
          goLast()
          break
        case '1':
          // 适应窗口
          if (fitMode !== 'fit') {
            setFitMode('fit')
            resetView()
            showToast('适应窗口')
          }
          break
        case '2':
          // 原始尺寸
          if (fitMode !== 'actual') {
            setFitMode('actual')
            showToast('原始尺寸 100%')
          }
          break
        case '0':
          // 切换适应/原始
          cycleFitMode()
          break
        default:
          // Ctrl+C 复制图片
          if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !window.getSelection()?.toString()) {
            // 只在没有选中文本时复制图片
            e.preventDefault()
            void copyImage()
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    onClose,
    prev,
    next,
    goFirst,
    goLast,
    slideshow,
    stopSlideshow,
    fitMode,
    resetView,
    showToast,
    cycleFitMode,
    copyImage
  ])

  // ===== Ctrl + 滚轮缩放 / 普通滚轮翻页 =====
  useEffect(() => {
    const onWheel = (e: WheelEvent): void => {
      // Ctrl + 滚轮：缩放
      if (e.ctrlKey) {
        e.preventDefault()
        const stage = stageRef.current
        if (stage) {
          const rect = stage.getBoundingClientRect()
          const x = rect.width ? ((e.clientX - rect.left) / rect.width) * 100 : 50
          const y = rect.height ? ((e.clientY - rect.top) / rect.height) * 100 : 50
          setZoomOrigin({ x, y })
        }
        setZoom((z) => {
          const nz = e.deltaY < 0 ? z * ZOOM_STEP : z / ZOOM_STEP
          return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nz))
        })
        return
      }

      // 非 Ctrl 滚轮：翻页（带节流，避免滚轮事件过密）
      if (wheelLockRef.current) return
      e.preventDefault()
      wheelLockRef.current = true
      setTimeout(() => {
        wheelLockRef.current = false
      }, 350)
      if (e.deltaY > 0) {
        next()
      } else {
        prev()
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [next, prev])

  // ===== 关闭时退出全屏 =====
  const handleClose = useCallback((): void => {
    if (isFullscreen) {
      void window.api.toggleFullscreen()
    }
    onClose()
  }, [isFullscreen, onClose])

  // 放大后拖拽平移：仅在 zoom>1 时启用
  /** 约束平移量，使图片边缘不越过舞台/右栏边界（内侧） */
  const clampOffset = useCallback(
    (tx: number, ty: number): { x: number; y: number } => {
      const stage = stageRef.current
      if (!stage) return { x: tx, y: ty }
      const { width, height } = stage.getBoundingClientRect()
      if (zoom <= 1 || width === 0 || height === 0) return { x: 0, y: 0 }
      // 图片绕 zoomOrigin 放大后的外扩量；translate 需反向补偿使边缘贴合舞台边界
      const originX = zoomOrigin.x / 100
      const originY = zoomOrigin.y / 100
      const left = (zoom - 1) * originX * width
      const right = (zoom - 1) * (1 - originX) * width
      const top = (zoom - 1) * originY * height
      const bottom = (zoom - 1) * (1 - originY) * height
      return {
        x: Math.max(-left, Math.min(right, tx)),
        y: Math.max(-top, Math.min(bottom, ty))
      }
    },
    [zoom, zoomOrigin]
  )

  // 缩放或缩放中心变化时，把当前平移约束回合法范围（放大保持、退到1倍归零）
  // 用 rAF 延迟 setState，避免在 effect 中同步调用引起级联渲染
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setOffset((cur) => clampOffset(cur.x, cur.y))
    })
    return () => cancelAnimationFrame(raf)
  }, [zoom, zoomOrigin, clampOffset])

  if (!photo) return <></>

  const isPanning = zoom > 1
  const onMouseDown = (e: React.MouseEvent): void => {
    if (!isPanning || e.button !== 0) return
    e.preventDefault()
    dragStartRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y }
    setDragging(true)
  }
  const onMouseMove = (e: React.MouseEvent): void => {
    const d = dragStartRef.current
    if (!d) return
    const v = clampOffset(
      d.ox + (e.clientX - d.px),
      d.oy + (e.clientY - d.py)
    )
    setOffset(v)
  }
  const onMouseUp = (): void => {
    dragStartRef.current = null
    setDragging(false)
  }

  // 双击全屏切换
  const onDoubleClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    void toggleFullscreen()
  }

  const gpsText =
    photo.gpsLat != null && photo.gpsLng != null
      ? `${photo.gpsLat.toFixed(6)}, ${photo.gpsLng.toFixed(6)}${
          photo.gpsAlt != null ? `，海拔 ${photo.gpsAlt.toFixed(1)}m` : ''
        }`
      : '无 GPS 信息'

  // 适应模式下的图片样式
  const imgStyle: React.CSSProperties =
    fitMode === 'actual'
      ? {
          maxWidth: 'none',
          maxHeight: 'none',
          width: photo.width != null ? `${photo.width}px` : 'auto',
          height: photo.height != null ? `${photo.height}px` : 'auto',
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`
        }
      : {
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`
        }

  return (
    <div className={`lightbox${isFullscreen ? ' fullscreen' : ''}`} onClick={handleClose}>
      <div
        className={`lightbox-stage${isPanning ? ' pannable' : ''}${dragging ? ' dragging' : ''}`}
        ref={stageRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={onDoubleClick}
      >
        <img
          className={`lightbox-img${fitMode === 'actual' ? ' actual-size' : ''}`}
          src={window.api.photoUrl(photo.path)}
          alt={photo.filename}
          style={imgStyle}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
        <button
          className="lb-close"
          title="关闭预览 (Esc)"
          onClick={(e) => {
            e.stopPropagation()
            handleClose()
          }}
        >
          ×
        </button>
        <button
          className="lb-nav lb-prev"
          title="上一张 (←)"
          disabled={index <= 0}
          onClick={(e) => {
            e.stopPropagation()
            prev()
          }}
        >
          ‹
        </button>
        <button
          className="lb-nav lb-next"
          title={noMoreNext ? '已是最后一张' : '下一张 (→)'}
          disabled={noMoreNext}
          onClick={(e) => {
            e.stopPropagation()
            next()
          }}
        >
          ›
        </button>

        {/* 底部工具栏 */}
        <div className="lb-toolbar" onClick={(e) => e.stopPropagation()}>
          <button
            className="lb-tool-btn"
            title="上一张 (←)"
            disabled={index <= 0}
            onClick={() => prev()}
          >
            ‹
          </button>
          <button
            className="lb-tool-btn"
            title={noMoreNext ? '已是最后一张' : '下一张 (→)'}
            disabled={noMoreNext}
            onClick={() => next()}
          >
            ›
          </button>
          <span className="lb-tool-sep" />
          <button
            className="lb-tool-btn"
            title={slideshow ? '停止幻灯片' : '开始幻灯片播放'}
            onClick={() => setSlideshow((s) => !s)}
          >
            {slideshow ? '❚❚' : '▶'}
          </button>
          <span className="lb-tool-sep" />
          <button
            className={`lb-tool-btn${fitMode === 'fit' ? ' on' : ''}`}
            title="适应窗口 (1)"
            onClick={() => {
              if (fitMode !== 'fit') {
                setFitMode('fit')
                resetView()
                showToast('适应窗口')
              }
            }}
          >
            ⊡
          </button>
          <button
            className={`lb-tool-btn${fitMode === 'actual' ? ' on' : ''}`}
            title="原始尺寸 (2)"
            onClick={() => {
              if (fitMode !== 'actual') {
                setFitMode('actual')
                showToast('原始尺寸 100%')
              }
            }}
          >
            1:1
          </button>
          <span className="lb-tool-sep" />
          <button
            className="lb-tool-btn"
            title="复制图片 (Ctrl+C)"
            onClick={() => void copyImage()}
          >
            ⧉
          </button>
          <button
            className="lb-tool-btn"
            title="复制文件路径"
            onClick={() => void copyPath()}
          >
            路径
          </button>
          <span className="lb-tool-sep" />
          <button
            className="lb-tool-btn"
            title={isFullscreen ? '退出全屏' : '全屏 (双击)'}
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? '⤢' : '⛶'}
          </button>
        </div>

        {/* 幻灯片进度条 */}
        {slideshow && (
          <div className="slideshow-progress">
            <div className="slideshow-progress-bar" />
          </div>
        )}

        {/* Toast 提示 */}
        {toast && <div className="lb-toast">{toast}</div>}
      </div>

      {sideOpen ? (
        <aside className="lightbox-side" onClick={(e) => e.stopPropagation()}>
          <div className="side-header">
            <span className="side-name" title={photo.path}>
              {photo.filename}
            </span>
            <button className="btn-icon side-collapse" title="收起信息栏" onClick={() => setSideOpen(false)}>
              »
            </button>
          </div>
          <div className="lightbox-actions">
            <button
              className={`fav-btn${photo.favorite === 1 ? ' on' : ''}`}
              title={photo.favorite === 1 ? '取消收藏' : '收藏'}
              onClick={() => onSetFavorite(photo, photo.favorite === 1 ? false : true)}
            >
              {photo.favorite === 1 ? '♥' : '♡'}
            </button>
            <RatingStars value={photo.rating} onChange={(v) => onSetRating(photo, v)} />
          </div>
          <div className="side-counter">
            {index + 1} / {photos.length}
            {zoom > 1 && <span className="zoom-indicator">{Math.round(zoom * 100)}%</span>}
            {fitMode === 'actual' && <span className="zoom-indicator">1:1</span>}
          </div>
          <div className="lightbox-detail">
            <div className="detail-grid">
              <span className="detail-label">拍摄时间</span>
              <span className="detail-value">
                {photo.takenAt != null ? formatDateTime(photo.takenAt) : '—'}
              </span>
              <span className="detail-label">设备</span>
              <span className="detail-value">
                {photo.make ? `${photo.make}${photo.model ? ` ${photo.model}` : ''}` : '—'}
              </span>
              <span className="detail-label">镜头</span>
              <span className="detail-value">{photo.lens ?? '—'}</span>
              <span className="detail-label">焦距</span>
              <span className="detail-value">
                {photo.focalLength != null ? `${photo.focalLength} mm` : '—'}
              </span>
              <span className="detail-label">光圈</span>
              <span className="detail-value">
                {photo.fnumber != null ? `f/${photo.fnumber}` : '—'}
              </span>
              <span className="detail-label">快门</span>
              <span className="detail-value">{photo.exposure ?? '—'}</span>
              <span className="detail-label">ISO</span>
              <span className="detail-value">{photo.iso ?? '—'}</span>
              <span className="detail-label">尺寸</span>
              <span className="detail-value">
                {photo.width != null && photo.height != null
                  ? `${photo.width} × ${photo.height} px`
                  : '—'}
              </span>
              <span className="detail-label">文件大小</span>
              <span className="detail-value">{formatBytes(photo.size)}</span>
              <span className="detail-label">位置</span>
              <span className="detail-value">{gpsText}</span>
              <span className="detail-label">路径</span>
              <span className="detail-value detail-path" title={photo.path}>
                {photo.path}
              </span>
            </div>
          </div>
        </aside>
      ) : (
        <button
          className="btn side-toggle"
          title="展开信息栏"
          onClick={(e) => {
            e.stopPropagation()
            setSideOpen(true)
          }}
        >
          信息 ◄
        </button>
      )}
    </div>
  )
}

export default Lightbox
