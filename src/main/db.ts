import Database from 'better-sqlite3'
import type {
  Folder,
  GpsPhotoList,
  Photo,
  PhotoListOptions,
  PhotoPage,
  SortBy
} from '../shared/types'

let db: Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  added_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  size INTEGER,
  mtime INTEGER,
  width INTEGER,
  height INTEGER,
  format TEXT,
  thumb_path TEXT,
  taken_at INTEGER,
  make TEXT,
  model TEXT,
  lens TEXT,
  fnumber REAL,
  iso INTEGER,
  exposure TEXT,
  focal_length INTEGER,
  gps_lat REAL,
  gps_lng REAL,
  gps_alt REAL,
  rating INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_folder ON photos(folder_id);
CREATE INDEX IF NOT EXISTS idx_photos_taken ON photos(taken_at);
CREATE INDEX IF NOT EXISTS idx_photos_gps ON photos(gps_lat, gps_lng);
CREATE INDEX IF NOT EXISTS idx_photos_rating ON photos(rating, favorite);
`

export function initDb(dbPath: string): void {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
}

export function closeDb(): void {
  db?.close()
}

// ---------- folders ----------

export function listFolders(): Folder[] {
  return db
    .prepare(
      `SELECT f.id, f.path, f.name,
              (SELECT COUNT(*) FROM photos p WHERE p.folder_id = f.id) AS photoCount
       FROM folders f ORDER BY f.added_at`
    )
    .all() as Folder[]
}

export function getFolder(id: number): Folder | null {
  const row = db
    .prepare(
      `SELECT f.id, f.path, f.name,
              (SELECT COUNT(*) FROM photos p WHERE p.folder_id = f.id) AS photoCount
       FROM folders f WHERE f.id = ?`
    )
    .get(id) as Folder | undefined
  return row ?? null
}

export function addFolder(path: string, name: string): Folder {
  db.prepare('INSERT OR IGNORE INTO folders (path, name, added_at) VALUES (?, ?, ?)').run(
    path,
    name,
    Date.now()
  )
  const row = db.prepare('SELECT id FROM folders WHERE path = ?').get(path) as { id: number }
  return getFolder(row.id)!
}

export function removeFolder(id: number): string[] {
  // 先取出该文件夹全部照片路径（删除记录后用于清理对应缓存文件）
  const rows = db.prepare('SELECT path FROM photos WHERE folder_id = ?').all(id) as Array<{
    path: string
  }>
  db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  return rows.map((r) => r.path)
}

// ---------- photos ----------

const PHOTO_COLUMNS = `id, folder_id AS folderId, path, filename, size, mtime, width, height,
  format, thumb_path AS thumbPath, taken_at AS takenAt, make, model, lens, fnumber, iso,
  exposure, focal_length AS focalLength, gps_lat AS gpsLat, gps_lng AS gpsLng,
  gps_alt AS gpsAlt, rating, favorite`

/** LIKE 通配符转义 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => '\\' + m)
}

/** 追加搜索条件（文件名/路径模糊匹配） */
function pushSearchClause(where: string[], params: Array<string | number>, search?: string): void {
  if (!search || !search.trim()) return
  const like = `%${escapeLike(search.trim())}%`
  where.push(`(filename LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\')`)
  params.push(like, like)
}

export function listPhotos(
  folderId: number,
  offset: number,
  limit: number,
  opts: PhotoListOptions = {}
): PhotoPage {
  const where = ['folder_id = ?']
  const params: Array<string | number> = [folderId]
  if (opts.filter === 'favorite') {
    where.push('favorite = 1')
  } else if (opts.filter === 'rated') {
    where.push('rating >= ?')
    params.push(opts.minRating ?? 1)
  }
  pushSearchClause(where, params, opts.search)
  const orderMap: Record<SortBy, string> = {
    taken_desc: 'taken_at DESC, id DESC',
    taken_asc: 'taken_at ASC, id ASC',
    filename: 'filename COLLATE NOCASE ASC, id ASC'
  }
  const orderBy = orderMap[opts.sortBy ?? 'taken_desc']
  const whereSql = where.join(' AND ')
  const photos = db
    .prepare(
      `SELECT ${PHOTO_COLUMNS} FROM photos WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Photo[]
  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM photos WHERE ${whereSql}`)
    .get(...params) as { total: number }
  return { photos, total }
}

export function updateRating(id: number, rating: number): void {
  const v = Math.max(0, Math.min(5, Math.round(rating)))
  db.prepare('UPDATE photos SET rating = ? WHERE id = ?').run(v, id)
}

export function updateFavorite(id: number, favorite: boolean): void {
  db.prepare('UPDATE photos SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id)
}

/** 地图视图：返回带 GPS 的照片（尊重过滤条件）+ 文件夹照片总数（用于统计无 GPS 数量） */
export function listGpsPhotos(folderId: number, opts: PhotoListOptions = {}): GpsPhotoList {
  const where = ['folder_id = ?', 'gps_lat IS NOT NULL', 'gps_lng IS NOT NULL']
  const params: Array<string | number> = [folderId]
  if (opts.filter === 'favorite') {
    where.push('favorite = 1')
  } else if (opts.filter === 'rated') {
    where.push('rating >= ?')
    params.push(opts.minRating ?? 1)
  }
  pushSearchClause(where, params, opts.search)
  const photos = db
    .prepare(`SELECT ${PHOTO_COLUMNS} FROM photos WHERE ${where.join(' AND ')}`)
    .all(...params) as Photo[]
  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM photos WHERE folder_id = ?')
    .get(folderId) as { total: number }
  return { photos, total }
}

export function countPhotos(folderId: number): number {
  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM photos WHERE folder_id = ?')
    .get(folderId) as { total: number }
  return total
}

/** 通过缩略图缓存文件名反查照片原路径（缓存文件缺失时用于按需重建） */
export function findPathByThumbPath(thumbPath: string): string | null {
  const row = db.prepare('SELECT path FROM photos WHERE thumb_path = ? LIMIT 1').get(thumbPath) as
    { path: string } | undefined
  return row?.path ?? null
}

// ---------- 扫描支持 ----------

export interface PhotoRecord {
  folderId: number
  path: string
  filename: string
  size: number | null
  mtime: number | null
  width: number | null
  height: number | null
  format: string | null
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
}

export function upsertPhoto(p: PhotoRecord): void {
  db.prepare(
    `INSERT INTO photos (folder_id, path, filename, size, mtime, width, height, format,
       thumb_path, taken_at, make, model, lens, fnumber, iso, exposure, focal_length,
       gps_lat, gps_lng, gps_alt, created_at)
     VALUES (@folderId, @path, @filename, @size, @mtime, @width, @height, @format,
       @thumbPath, @takenAt, @make, @model, @lens, @fnumber, @iso, @exposure, @focalLength,
       @gpsLat, @gpsLng, @gpsAlt, @createdAt)
     ON CONFLICT(path) DO UPDATE SET
       folder_id = excluded.folder_id, filename = excluded.filename, size = excluded.size,
       mtime = excluded.mtime, width = excluded.width, height = excluded.height,
       format = excluded.format, thumb_path = excluded.thumb_path, taken_at = excluded.taken_at,
       make = excluded.make, model = excluded.model, lens = excluded.lens,
       fnumber = excluded.fnumber, iso = excluded.iso, exposure = excluded.exposure,
       focal_length = excluded.focal_length, gps_lat = excluded.gps_lat,
       gps_lng = excluded.gps_lng, gps_alt = excluded.gps_alt
     -- 注意：不更新 rating / favorite，保留用户数据`
  ).run({ ...p, createdAt: Date.now() })
}

/** 开始一次扫描：登记本次将处理的文件集合，供扫描结束后清理已删除文件 */
export function scanBegin(folderId: number): void {
  db.exec('CREATE TEMP TABLE IF NOT EXISTS tmp_scan (folder_id INTEGER, path TEXT)')
  db.prepare('DELETE FROM tmp_scan WHERE folder_id = ?').run(folderId)
}

/** 获取该文件夹现有记录（path → mtime/size/thumbPath），供增量扫描跳过未变化的文件 */
export function getExistingRecords(
  folderId: number
): Map<string, { mtime: number; size: number; thumbPath: string | null }> {
  const rows = db
    .prepare('SELECT path, mtime, size, thumb_path FROM photos WHERE folder_id = ?')
    .all(folderId) as Array<{
    path: string
    mtime: number | null
    size: number | null
    thumb_path: string | null
  }>
  const map = new Map<string, { mtime: number; size: number; thumbPath: string | null }>()
  for (const r of rows) {
    map.set(r.path, { mtime: r.mtime ?? 0, size: r.size ?? 0, thumbPath: r.thumb_path })
  }
  return map
}

export function scanMark(folderId: number, path: string): void {
  db.prepare('INSERT INTO tmp_scan (folder_id, path) VALUES (?, ?)').run(folderId, path)
}

/** 结束扫描：删除该文件夹下本次未出现的记录（文件已被删除/移动），返回被删除的照片路径 */
export function scanEnd(folderId: number): string[] {
  const rows = db
    .prepare(
      `SELECT path FROM photos
       WHERE folder_id = ? AND path NOT IN (SELECT path FROM tmp_scan WHERE folder_id = ?)`
    )
    .all(folderId, folderId) as Array<{ path: string }>
  const removed = rows.map((r) => r.path)
  if (removed.length > 0) {
    db.prepare(
      `DELETE FROM photos
       WHERE folder_id = ? AND path NOT IN (SELECT path FROM tmp_scan WHERE folder_id = ?)`
    ).run(folderId, folderId)
  }
  return removed
}
