import { useCallback, useEffect, useState } from 'react'
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

  const prev = useCallback(() => {
    if (index > 0) onNavigate(index - 1)
  }, [index, onNavigate])

  const next = useCallback(() => {
    if (index < photos.length - 1) {
      onNavigate(index + 1)
    } else if (onLoadMore) {
      onLoadMore() // 已到已加载末尾：请求下一页，加载后继续可翻
    }
  }, [index, photos.length, onNavigate, onLoadMore])

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

  if (!photo) return <></>

  const gpsText =
    photo.gpsLat != null && photo.gpsLng != null
      ? `${photo.gpsLat.toFixed(6)}, ${photo.gpsLng.toFixed(6)}${
          photo.gpsAlt != null ? `，海拔 ${photo.gpsAlt.toFixed(1)}m` : ''
        }`
      : '无 GPS 信息'

  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox-stage">
        <img
          className="lightbox-img"
          src={window.api.photoUrl(photo.path)}
          alt={photo.filename}
          onClick={(e) => e.stopPropagation()}
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
