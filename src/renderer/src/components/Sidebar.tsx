import { useCallback, useEffect, useRef, useState } from 'react'
import type { Folder, ScanProgress } from '../../../shared/types'

interface Props {
  folders: Folder[]
  activeId: number | null
  scanMap: Record<number, ScanProgress>
  onSelect: (id: number) => void
  onAdd: () => void
  onRemove: (id: number) => void
}

const MAX_WIDTH = 400
const COLLAPSE_THRESHOLD = 200

function Sidebar({
  folders,
  activeId,
  scanMap,
  onSelect,
  onAdd,
  onRemove
}: Props): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(240)

  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const widthRef = useRef(240)

  const expand = useCallback((): void => {
    const next = Math.max(widthRef.current, COLLAPSE_THRESHOLD)
    widthRef.current = next
    setWidth(next)
    setCollapsed(false)
  }, [])

  const onResizeStart = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    draggingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = widthRef.current
    document.body.style.cursor = 'col-resize'
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return
      const next = startWidthRef.current + (e.clientX - startXRef.current)
      // 到达临界值：立即自动收起，无需松开鼠标；宽度重置到临界值，展开后从临界值恢复
      if (next <= COLLAPSE_THRESHOLD) {
        draggingRef.current = false
        document.body.style.cursor = ''
        widthRef.current = COLLAPSE_THRESHOLD
        setWidth(COLLAPSE_THRESHOLD)
        setCollapsed(true)
        return
      }
      const clamped = Math.min(MAX_WIDTH, next)
      widthRef.current = clamped
      setWidth(clamped)
    }
    const onUp = (): void => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  if (collapsed) {
    return (
      <aside
        className="sidebar sidebar-collapsed"
        title="展开相册"
        onClick={expand}
      >
        <span className="sidebar-toggle-icon">»</span>
      </aside>
    )
  }

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sidebar-header">
        <span className="sidebar-title">相册</span>
        <div className="sidebar-actions">
          <button className="btn-icon" title="收起相册" onClick={() => setCollapsed(true)}>
            «
          </button>
          <button className="btn-icon" title="添加文件夹" onClick={onAdd}>
            ＋
          </button>
        </div>
      </div>
      <ul className="folder-list">
        {folders.length === 0 && (
          <li className="folder-empty">
            <p>还没有照片文件夹</p>
            <button className="btn" onClick={onAdd}>
              添加第一个文件夹
            </button>
          </li>
        )}
        {folders.map((f) => {
          const scan = scanMap[f.id]
          const scanning = scan && (scan.phase === 'walking' || scan.phase === 'processing')
          return (
            <li
              key={f.id}
              className={`folder-item${f.id === activeId ? ' active' : ''}`}
              onClick={() => onSelect(f.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                void window.api.folders.showContextMenu(f.path, e.clientX, e.clientY)
              }}
            >
              <div className="folder-name">{f.name}</div>
              <div className="folder-meta">
                <span>{f.photoCount} 张</span>
                {scanning && scan.total > 0 && (
                  <span className="folder-scan">
                    {Math.round((scan.done / scan.total) * 100)}%
                  </span>
                )}
              </div>
              <button
                className="btn-icon folder-remove"
                title="移除文件夹"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(f.id)
                }}
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
      <div className="sidebar-resizer" onMouseDown={onResizeStart} />
    </aside>
  )
}

export default Sidebar
