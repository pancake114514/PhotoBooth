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

  // 末尾且没有更多可加载 → 禁用下一张
  const noMoreNext = index >= photos.length - 1 && (!onLoadMore || photos.length >= total)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, prev, next])

  // Ctrl + 滚轮缩放：上滚（deltaY<0）放大，下滚缩小；clamp 到 [1, 8]
  // 缩放中心跟随鼠标指针位置（以舞台为参考的百分比）
  useEffect(() => {
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const stage = stageRef.current
      if (stage) {
        const rect = stage.getBoundingClientRect()
        const x = rect.width ? ((e.clientX - rect.left) / rect.width) * 100 : 50
        const y = rect.height ? ((e.clientY - rect.top) / rect.height) * 100 : 50
        setZoomOrigin({ x, y })
      }
      setZoom((z) => {
        const next = e.deltaY < 0 ? z * ZOOM_STEP : z / ZOOM_STEP
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
      })
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  if (!photo) return <></>

  // 放大后拖拽平移：仅在 zoom>1 时启用
  const isPanning = zoom > 1
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
  useEffect(() => {
    setOffset((cur) => clampOffset(cur.x, cur.y))
  }, [zoom, zoomOrigin, clampOffset])
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

  const gpsText =
    photo.gpsLat != null && photo.gpsLng != null
      ? `${photo.gpsLat.toFixed(6)}, ${photo.gpsLng.toFixed(6)}${
          photo.gpsAlt != null ? `，海拔 ${photo.gpsAlt.toFixed(1)}m` : ''
        }`
      : '无 GPS 信息'

  return (
    <div className="lightbox" onClick={onClose}>
      <div
        className={`lightbox-stage${isPanning ? ' pannable' : ''}${dragging ? ' dragging' : ''}`}
        ref={stageRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <img
          className="lightbox-img"
          src={window.api.photoUrl(photo.path)}
          alt={photo.filename}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`
          }}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
        <button
          className="lb-close"
          title="关闭预览 (Esc)"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
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
