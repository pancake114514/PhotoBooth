import type { Folder, ScanProgress } from '../../../shared/types'

interface Props {
  folders: Folder[]
  activeId: number | null
  scanMap: Record<number, ScanProgress>
  collapsed: boolean
  onSelect: (id: number) => void
  onAdd: () => void
  onRemove: (id: number) => void
  onExpand: () => void
}

function Sidebar({
  folders,
  activeId,
  scanMap,
  collapsed,
  onSelect,
  onAdd,
  onRemove,
  onExpand
}: Props): React.JSX.Element {
  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed" title="展开相册" onClick={onExpand}>
        <span className="sidebar-toggle-icon">»</span>
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">相册</span>
        <div className="sidebar-actions">
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
    </aside>
  )
}

export default Sidebar
