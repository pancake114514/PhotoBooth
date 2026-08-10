import { useEffect, useRef } from 'react'
import type { Photo } from '../../../shared/types'
import { formatDate } from '../utils/format'

interface Props {
  photos: Photo[]
  total: number
  loading: boolean
  onLoadMore: () => void
  onOpen: (index: number) => void
}

function PhotoGrid({ photos, total, loading, onLoadMore, onOpen }: Props): React.JSX.Element {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onLoadMore()
      },
      { rootMargin: '400px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onLoadMore])

  if (photos.length === 0 && !loading) {
    return (
      <div className="empty">
        <p>{total === 0 ? '暂无照片' : '已全部加载'}</p>
        {total === 0 && (
          <p className="empty-hint">点击右上角"重新扫描"，或先添加包含照片的文件夹</p>
        )}
      </div>
    )
  }

  return (
    <div className="grid">
      {photos.map((p, i) => (
        <figure key={p.id} className="cell" onClick={() => onOpen(i)}>
          <img
            className="cell-img"
            src={p.thumbPath ? window.api.thumbUrl(p.thumbPath) : window.api.photoUrl(p.path)}
            alt={p.filename}
            loading="lazy"
          />
          {(p.favorite === 1 || p.rating > 0) && (
            <div className="cell-badges">
              {p.favorite === 1 && (
                <span className="badge badge-fav" title="已收藏">
                  ♥
                </span>
              )}
              {p.rating > 0 && (
                <span className="badge badge-rating" title={`${p.rating} 星`}>
                  {'★'.repeat(p.rating)}
                </span>
              )}
            </div>
          )}
          <figcaption className="cell-caption">
            <span className="cell-name">{p.filename}</span>
            {p.takenAt != null && <span className="cell-date">{formatDate(p.takenAt)}</span>}
          </figcaption>
        </figure>
      ))}
      <div ref={sentinelRef} className="sentinel" />
      {loading && <div className="loading">加载中…</div>}
      {!loading && photos.length >= total && total > 0 && (
        <div className="end-hint">已显示全部 {total} 张</div>
      )}
    </div>
  )
}

export default PhotoGrid
