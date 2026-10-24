import { useEffect, useRef, useState } from "react"

type B = { number: string; lat: number | null; lng: number | null; locationTs: number | null }
const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
const CAMPUS = { lat: 22.2895, lng: 73.3633 } // Parul University, Waghodia

let loader: Promise<any> | null = null
const loadMaps = () =>
  (loader ??= new Promise((res) => {
    const w = window as any
    if (w.google?.maps) return res(w.google)
    const s = document.createElement("script")
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&v=weekly`
    s.async = true
    s.onload = () => res(w.google)
    s.onerror = () => res(null)
    document.head.appendChild(s)
  }))

const BUS_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='52' height='52' viewBox='0 0 52 52'><circle cx='26' cy='26' r='24' fill='#12213b' stroke='#f2b705' stroke-width='3'/><rect x='12' y='14' width='28' height='22' rx='5' fill='#f2b705'/><rect x='15' y='17' width='22' height='9' rx='2' fill='#12213b'/><circle cx='18' cy='38' r='3' fill='#12213b'/><circle cx='34' cy='38' r='3' fill='#12213b'/></svg>`,
  )

export default function GoogleLiveMap({ bus }: { bus: B }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  const marker = useRef<any>(null)
  const trail = useRef<any>(null)
  const [failed, setFailed] = useState(false) // Google rejected the key (billing / restriction) -> keyless map
  const useJs = !!KEY && !failed
  const live = bus.lat != null && bus.lng != null
  const pos = live ? { lat: bus.lat!, lng: bus.lng! } : CAMPUS

  // Full Google Maps JS API (needs a free-tier key) — animated marker + trail
  useEffect(() => {
    if (!useJs || !box.current) return
    let dead = false
    ;(window as any).gm_authFailure = () => setFailed(true)
    loadMaps().then((google) => {
      if (!google) return setFailed(true)
      if (dead || !box.current) return
      if (!map.current) {
        map.current = new google.maps.Map(box.current, { center: pos, zoom: 16, disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy" })
        marker.current = new google.maps.Marker({ map: map.current, position: pos, title: bus.number, icon: { url: BUS_ICON, scaledSize: new google.maps.Size(46, 46), anchor: new google.maps.Point(23, 23) } })
        trail.current = new google.maps.Polyline({ map: map.current, strokeColor: "#f2b705", strokeWeight: 5, strokeOpacity: 0.9 })
      }
      const from = marker.current.getPosition()
      const t0 = performance.now()
      const step = () => {
        if (dead) return
        const k = Math.min(1, (performance.now() - t0) / 1500)
        marker.current.setPosition({ lat: from.lat() + (pos.lat - from.lat()) * k, lng: from.lng() + (pos.lng - from.lng()) * k })
        if (k < 1) requestAnimationFrame(step)
      }
      step()
      if (live) {
        trail.current.getPath().push(new google.maps.LatLng(pos.lat, pos.lng))
        map.current.panTo(pos)
      }
    })
    return () => { dead = true }
  }, [pos.lat, pos.lng, useJs])

  return (
    <div className="gmap">
      {useJs ? (
        <div ref={box} style={{ width: "100%", height: 340 }} />
      ) : (
        // Keyless real Google Map (free, no billing needed)
        <iframe title="Google live map" style={{ width: "100%", height: 340, border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps?q=${pos.lat},${pos.lng}&z=16&output=embed`} />
      )}
      <div className="gmap-badge">
        <span className="live-dot" style={{ background: live ? "#1f9d55" : "#f2b705" }} />
        {live ? `Live · ${bus.number} · ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : "Waiting for driver to share GPS — showing campus"}
      </div>
    </div>
  )
}
