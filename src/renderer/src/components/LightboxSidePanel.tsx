import { formatBytes, formatDateTime } from '../utils/format'
import RatingStars from './RatingStars'
import type { Photo } from '../../../shared/types'

interface Props {
  photo: Photo
  index: number
  total: number
  zoom: number
  fitMode: 'fit' | 'actual'
  sideOpen: boolean
  onToggleSide: () => void
  onSetRating: (photo: Photo, rating: number) => void
  onSetFavorite: (photo: Photo, favorite: boolean) => void
}

/** 大图预览右侧信息面板：文件名、评分收藏、EXIF 详情、缩放指示 */
function LightboxSidePanel({
  photo,
  index,
  total,
  zoom,
  fitMode,
  sideOpen,
  onToggleSide,
  onSetRating,
  onSetFavorite
}: Props): React.JSX.Element {
  const gpsText =
    photo.gpsLat != null && photo.gpsLng != null
      ? `${photo.gpsLat.toFixed(6)}, ${photo.gpsLng.toFixed(6)}${
          photo.gpsAlt != null ? `，海拔 ${photo.gpsAlt.toFixed(1)}m` : ''
        }`
      : '无 GPS 信息'

  if (!sideOpen) {
    return (
      <button className="btn side-toggle" title="展开信息栏 (Tab)" onClick={onToggleSide}>
        信息 ◄
      </button>
    )
  }

  return (
    <aside className="lightbox-side" onClick={(e) => e.stopPropagation()}>
      <div className="side-header">
        <span className="side-name" title={photo.path}>
          {photo.filename}
        </span>
        <button className="btn-icon side-collapse" title="收起信息栏 (Tab)" onClick={onToggleSide}>
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
        {index + 1} / {total}
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
          <span className="detail-value">{photo.fnumber != null ? `f/${photo.fnumber}` : '—'}</span>
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
  )
}

export default LightboxSidePanel
