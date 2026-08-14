import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { Photo } from '../../../shared/types'
import { wgs84ToGcj02 } from '../utils/coord'

interface BasemapDef {
  id: string
  name: string
  url: string
  subdomains?: string
  /** 底图使用 GCJ-02（火星坐标），需要把照片 WGS-84 坐标纠偏 */
  gcj02: boolean
  attribution: string
}

const BASEMAPS: BasemapDef[] = [
  {
    id: 'arcgis',
    name: 'ArcGIS',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    subdomains: 'abc', // URL 无 {s}，但 Leaflet 仍会访问 subdomains，需提供非空值避免崩溃
    gcj02: false,
    attribution: '© Esri'
  },
  {
    id: 'amap',
    name: '高德',
    url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    subdomains: '1234',
    gcj02: true,
    attribution: '© 高德地图'
  },
  {
    id: 'amap-sat',
    name: '卫星',
    url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    subdomains: '1234',
    gcj02: true,
    attribution: '© 高德地图'
  },
  {
    id: 'osm',
    name: 'OSM',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc', // URL 无 {s}，但 Leaflet 仍会访问 subdomains，需提供非空值避免崩溃
    gcj02: false,
    attribution: '© OpenStreetMap'
  }
]

/** 照片坐标 → 地图坐标（按底图坐标系转换），返回 [lat, lng] */
function toMapCoords(p: Photo, gcj02: boolean): [number, number] {
  if (p.gpsLat == null || p.gpsLng == null) return [0, 0]
  if (!gcj02) return [p.gpsLat, p.gpsLng]
  const [lng, lat] = wgs84ToGcj02(p.gpsLng, p.gpsLat)
  return [lat, lng]
}

interface MapViewProps {
  /** 带 GPS 的照片 */
  photos: Photo[]
  /** 文件夹照片总数（含无 GPS），用于提示未显示数量 */
  total: number
  onOpenPhoto: (photo: Photo) => void
}

/** 聚簇图层：缩略图 marker + markercluster 聚合 + 自适应视野 */
function ClusterLayer({
  photos,
  basemap,
  onOpenPhoto
}: {
  photos: Photo[]
  basemap: BasemapDef
  onOpenPhoto: (p: Photo) => void
}): React.JSX.Element | null {
  const map = useMap()
  const onOpenRef = useRef(onOpenPhoto)
  // 记录上次 fitBounds 对应的照片集合，用于区分「照片变化」与「仅切换底图」
  const fittedPhotosRef = useRef<Photo[] | null>(null)
  useEffect(() => {
    onOpenRef.current = onOpenPhoto
  }, [onOpenPhoto])

  useEffect(() => {
    if (photos.length === 0) return

    const layer = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 60,
      showCoverageOnHover: false
    })
    const coords: [number, number][] = []

    for (const p of photos) {
      const pos = toMapCoords(p, basemap.gcj02)
      coords.push(pos)
      const iconUrl = p.thumbPath ? window.api.thumbUrl(p.thumbPath) : window.api.photoUrl(p.path)
      const icon = L.divIcon({
        className: '',
        html: `<div class="photo-marker" style="background-image:url('${iconUrl}')"></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      })
      const marker = L.marker(pos, { icon, title: p.filename })
      marker.on('click', () => onOpenRef.current(p))
      layer.addLayer(marker)
    }

    map.addLayer(layer)

    // 仅在照片集合变化时自适应视野；切换底图（basemap）只重建 marker，
    // 保持当前的缩放比例与中心位置
    if (fittedPhotosRef.current !== photos) {
      fittedPhotosRef.current = photos
      map.fitBounds(L.latLngBounds(coords), { padding: [48, 48], maxZoom: 15 })
    }

    return () => {
      map.removeLayer(layer)
    }
  }, [photos, basemap, map])

  return null
}

function MapView({ photos, total, onOpenPhoto }: MapViewProps): React.JSX.Element {
  const [basemapId, setBasemapId] = useState('osm') // 默认 OSM
  const basemap = BASEMAPS.find((b) => b.id === basemapId) ?? BASEMAPS[0]
  const noGps = total - photos.length

  return (
    <div className="map-view">
      <MapContainer center={[30, 105]} zoom={4} className="map-canvas" scrollWheelZoom>
        <TileLayer
          key={basemap.id}
          url={basemap.url}
          subdomains={basemap.subdomains}
          attribution={basemap.attribution}
        />
        <ClusterLayer photos={photos} basemap={basemap} onOpenPhoto={onOpenPhoto} />
      </MapContainer>
      <div className="basemap-switch">
        {BASEMAPS.map((b) => (
          <button
            key={b.id}
            className={b.id === basemapId ? 'on' : ''}
            title={b.name}
            onClick={() => setBasemapId(b.id)}
          >
            {b.name}
          </button>
        ))}
      </div>
      {photos.length === 0 && (
        <div className="map-note">该文件夹暂无带位置信息的照片</div>
      )}
      {photos.length > 0 && noGps > 0 && (
        <div className="map-note">{noGps} 张照片没有位置信息，未在地图上显示</div>
      )}
    </div>
  )
}

export default MapView
