// ---------------------------------------------------------------------------
// In-browser fallback engine.
//
// The Python backend (server/app.py) is the real API and runs in the dev /
// preview environment. But a PUBLISHED Figma site is static hosting — there is
// no Python process there — so the /api calls fail. This module mirrors the
// backend's data + maths exactly so the app still works when published or
// offline. Same routes, same enrich(), same average-speed / ETA formulas.
// ---------------------------------------------------------------------------

type Station = { name: string; km: number }
type RouteInfo = { name: string; stations: Station[] }
type RawBus = {
  id: string
  number: string
  plate: string
  route: string
  driver: string
  contact: string
  status: "active" | "inactive"
  currentStopIndex: number
  speed: number
  traffic: number
  passengers: number
  capacity: number
  rating: number
  speedHistory: number[]
  lat: number | null
  lng: number | null
  locationTs: number | null
}
type Feedback = { bus: string; stars: number; comment: string }

const ROUTES: Record<string, RouteInfo> = {
  r1: {
    name: "Vadodara Railway Station Line",
    stations: [
      { name: "Vadodara Railway Station", km: 0 },
      { name: "Genda Circle", km: 4.2 },
      { name: "Gorwa", km: 9.6 },
      { name: "Waghodia Chokdi", km: 15.8 },
      { name: "Parul Campus Main Gate", km: 21.5 },
      { name: "Academic Block 5", km: 22.7 },
    ],
  },
  r2: {
    name: "Karelibaug — Sama Line",
    stations: [
      { name: "Karelibaug", km: 0 },
      { name: "Sama Savli Road", km: 5.1 },
      { name: "Harni", km: 10.4 },
      { name: "Waghodia Road", km: 16.9 },
      { name: "Parul Campus", km: 20.3 },
    ],
  },
  r3: {
    name: "Ajwa — Chhani Line",
    stations: [
      { name: "Ajwa Road", km: 0 },
      { name: "Chhani", km: 6.7 },
      { name: "Waghodia", km: 13.2 },
      { name: "Parul Campus", km: 18.4 },
    ],
  },
}

const BUSES: RawBus[] = [
  { id: "pu14", number: "PU-14", plate: "GJ06 XV 4471", route: "r1", driver: "Ramesh Patel", contact: "+91 98250 11122", status: "active", currentStopIndex: 1, speed: 28, traffic: 0.85, passengers: 34, capacity: 60, rating: 4.4, speedHistory: [26, 30, 28], lat: null, lng: null, locationTs: null },
  { id: "pu22", number: "PU-22", plate: "GJ06 XV 8890", route: "r2", driver: "Sanjay Chauhan", contact: "+91 98250 33445", status: "active", currentStopIndex: 2, speed: 24, traffic: 0.85, passengers: 51, capacity: 60, rating: 4.1, speedHistory: [22, 25, 24], lat: null, lng: null, locationTs: null },
  { id: "pu08", number: "PU-08", plate: "GJ06 XV 2207", route: "r3", driver: "Vikram Solanki", contact: "+91 98250 55667", status: "inactive", currentStopIndex: 0, speed: 26, traffic: 0.85, passengers: 0, capacity: 50, rating: 4.7, speedHistory: [26], lat: null, lng: null, locationTs: null },
]

const FEEDBACK: Feedback[] = [
  { bus: "PU-14", stars: 5, comment: "Right on time this morning, driver announced each stop." },
  { bus: "PU-22", stars: 4, comment: "A little crowded near Harni but predicted ETA was accurate." },
]

let nextId = 100

function avgSpeed(bus: RawBus): number {
  const hist = bus.speedHistory.length ? bus.speedHistory : [bus.speed]
  return hist.reduce((a, b) => a + b, 0) / hist.length
}
function effectiveSpeed(bus: RawBus): number {
  return Math.max(4, avgSpeed(bus) * bus.traffic)
}

function enrich(bus: RawBus) {
  const route = ROUTES[bus.route]
  const stations = route.stations
  const idx = Math.max(0, Math.min(bus.currentStopIndex, stations.length - 1))
  const currentKm = stations[idx].km
  const eff = effectiveSpeed(bus)

  const stops = stations.map((s, i) => {
    const remaining = s.km - currentKm
    return {
      name: s.name,
      km: s.km,
      reached: i <= idx,
      current: i === idx,
      etaMin: remaining <= 0 ? 0 : Math.round((remaining / eff) * 60 * 10) / 10,
    }
  })

  const totalKm = stations[stations.length - 1].km
  const remainingToEnd = Math.max(0, totalKm - currentKm)
  const etaToEnd = remainingToEnd <= 0 ? 0 : (remainingToEnd / eff) * 60

  return {
    id: bus.id,
    number: bus.number,
    plate: bus.plate,
    route: bus.route,
    driver: bus.driver,
    contact: bus.contact,
    status: bus.status,
    currentStopIndex: idx,
    speed: bus.speed,
    traffic: bus.traffic,
    passengers: bus.passengers,
    capacity: bus.capacity,
    rating: bus.rating,
    lat: bus.lat,
    lng: bus.lng,
    locationTs: bus.locationTs,
    routeName: route.name,
    stations,
    currentStopName: stations[idx].name,
    nextStopName: stations[Math.min(idx + 1, stations.length - 1)].name,
    currentKm: Math.round(currentKm * 10) / 10,
    avgSpeed: Math.round(avgSpeed(bus) * 10) / 10,
    effectiveSpeed: Math.round(eff * 10) / 10,
    etaToEndMin: Math.round(etaToEnd * 10) / 10,
    progressPct: totalKm ? Math.round(Math.min(100, (currentKm / totalKm) * 100)) : 0,
    stops,
  }
}

export const localEngine = {
  getState() {
    return {
      routes: ROUTES,
      buses: BUSES.map(enrich),
      feedback: FEEDBACK,
    }
  },

  createBus(data: Record<string, any>) {
    if (!ROUTES[data.route]) return null
    nextId += 1
    const speed = Number(data.speed) || 25
    const bus: RawBus = {
      id: `bus${nextId}`,
      number: (data.number || `PU-${nextId}`).trim(),
      plate: (data.plate || "").trim(),
      route: data.route,
      driver: (data.driver || "Driver").trim(),
      contact: (data.contact || "").trim(),
      status: "active",
      currentStopIndex: 0,
      speed,
      traffic: 0.85,
      passengers: 0,
      capacity: Number(data.capacity) || 50,
      rating: 5.0,
      speedHistory: [speed],
      lat: null,
      lng: null,
      locationTs: null,
    }
    BUSES.push(bus)
    return enrich(bus)
  },

  updateBus(id: string, data: Record<string, any>) {
    const bus = BUSES.find((b) => b.id === id)
    if (!bus) return null
    const stations = ROUTES[bus.route].stations
    if ("currentStopIndex" in data) bus.currentStopIndex = Math.max(0, Math.min(Number(data.currentStopIndex), stations.length - 1))
    if ("passengers" in data) bus.passengers = Math.max(0, Math.min(Number(data.passengers), bus.capacity))
    if ("capacity" in data) {
      bus.capacity = Math.max(1, Number(data.capacity))
      bus.passengers = Math.min(bus.passengers, bus.capacity)
    }
    if ("traffic" in data) bus.traffic = Number(data.traffic)
    if ("status" in data) bus.status = data.status === "active" ? "active" : "inactive"
    if ("lat" in data && "lng" in data) {
      if (data.lat === null) {
        bus.lat = bus.lng = bus.locationTs = null
      } else {
        bus.lat = Number(data.lat)
        bus.lng = Number(data.lng)
        bus.locationTs = Date.now() / 1000
      }
    }
    if ("speed" in data) {
      bus.speed = Number(data.speed)
      bus.speedHistory.push(bus.speed)
      bus.speedHistory = bus.speedHistory.slice(-40)
    }
    return enrich(bus)
  },

  addFeedback(data: Record<string, any>) {
    const comment = (data.comment || "").trim()
    if (!comment) return null
    const entry: Feedback = {
      bus: data.bus || "",
      stars: Math.max(1, Math.min(Number(data.stars) || 5, 5)),
      comment,
    }
    FEEDBACK.push(entry)
    return entry
  },
}

// Used by the Vercel serverless function to save/restore state in Redis.
export const persist = {
  dump: () => ({ BUSES, FEEDBACK, nextId }),
  load(d: any) {
    BUSES.splice(0, BUSES.length, ...d.BUSES)
    FEEDBACK.splice(0, FEEDBACK.length, ...d.FEEDBACK)
    nextId = d.nextId
  },
}
