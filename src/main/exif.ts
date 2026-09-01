import exifr from 'exifr'

export interface ParsedExif {
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

const EMPTY: ParsedExif = {
  takenAt: null,
  make: null,
  model: null,
  lens: null,
  fnumber: null,
  iso: null,
  exposure: null,
  focalLength: null,
  gpsLat: null,
  gpsLng: null,
  gpsAlt: null
}

/** 将 [deg, min, sec]（+Ref）转为十进制经纬度 */
function dmsToDecimal(dms: unknown, ref: unknown): number | null {
  if (!Array.isArray(dms) || dms.length < 3) return null
  const [d, m, s] = dms.map((v) => Number(v))
  if ([d, m, s].some((v) => Number.isNaN(v))) return null
  let dec = d + m / 60 + s / 3600
  if (typeof ref === 'string' && (ref === 'S' || ref === 'W')) dec = -dec
  return dec
}

/** exifr 输出可能为 number 或 [num, den] rational */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (Array.isArray(v) && v.length === 2) {
    const [a, b] = v
    return typeof a === 'number' && typeof b === 'number' && b !== 0 ? a / b : null
  }
  return null
}

function toInt(v: unknown): number | null {
  const n = toNumber(v)
  return n == null ? null : Math.round(n)
}

/** 秒 → "1/125s" / "2s" */
function formatExposure(v: unknown): string | null {
  const n = toNumber(v)
  if (n == null) return null
  if (n < 1) return `1/${Math.round(1 / n)}s`
  return `${n}s`
}

function toDate(v: unknown): number | null {
  if (v == null) return null
  if (v instanceof Date) return v.getTime()
  // exifr 的 ExifDateTime
  if (typeof v === 'object' && typeof (v as { toDate?: unknown }).toDate === 'function') {
    const d = (v as { toDate: () => Date }).toDate()
    return Number.isNaN(d.getTime()) ? null : d.getTime()
  }
  if (typeof v === 'string') {
    // "2024:01:01 10:00:00" → "2024/01/01 10:00:00"（整段日期一并处理）
    const t = Date.parse(v.replace(/(\d{4}):(\d{2}):(\d{2}) /, '$1/$2/$3 '))
    return Number.isNaN(t) ? null : t
  }
  return null
}

/** 超时毫秒数：exifr 对损坏文件可能挂起，超时后返回空 EXIF 并跳过 */
const EXIF_TIMEOUT = 15_000

export async function parseExif(filePath: string): Promise<ParsedExif> {
  try {
    const result = await Promise.race([
      parseExifInternal(filePath),
      new Promise<ParsedExif>((_, reject) =>
        setTimeout(() => reject(new Error('EXIF parse timeout')), EXIF_TIMEOUT)
      )
    ])
    return result
  } catch {
    return { ...EMPTY }
  }
}

async function parseExifInternal(filePath: string): Promise<ParsedExif> {
  try {
    const out = await exifr.parse(filePath, {
      pick: [
        'Make',
        'Model',
        'LensModel',
        'FNumber',
        'ISO',
        'ExposureTime',
        'FocalLength',
        'DateTimeOriginal',
        'GPSLatitude',
        'GPSLongitude',
        'GPSAltitude',
        'GPSLatitudeRef',
        'GPSLongitudeRef',
        'GPSAltitudeRef'
      ]
    })
    if (!out) return { ...EMPTY }
    const gpsLat = dmsToDecimal(out.GPSLatitude, out.GPSLatitudeRef)
    const gpsLng = dmsToDecimal(out.GPSLongitude, out.GPSLongitudeRef)
    const alt = toNumber(out.GPSAltitude)
    return {
      takenAt: toDate(out.DateTimeOriginal),
      make: typeof out.Make === 'string' ? out.Make : null,
      model: typeof out.Model === 'string' ? out.Model : null,
      lens: typeof out.LensModel === 'string' ? out.LensModel : null,
      fnumber: toNumber(out.FNumber),
      iso: toInt(out.ISO),
      exposure: formatExposure(out.ExposureTime),
      focalLength: toInt(out.FocalLength),
      gpsLat: gpsLat === null && gpsLng === null ? null : gpsLat,
      gpsLng: gpsLat === null && gpsLng === null ? null : gpsLng,
      gpsAlt: alt === null ? null : out.GPSAltitudeRef === 1 ? -alt : alt
    }
  } catch {
    return { ...EMPTY }
  }
}
