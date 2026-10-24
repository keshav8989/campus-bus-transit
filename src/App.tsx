import { useEffect, useRef, useState } from "react"
import { localEngine } from "./busEngine"
import Scene3D from "./Scene3D"
import Home from "./Home"
import Gate, { type Role } from "./Gate"
import GoogleLiveMap from "./GoogleLiveMap"

// ---------- Types (mirror the Python backend payload) ----------
type Station = { name: string; km: number }
type Stop = { name: string; km: number; reached: boolean; current: boolean; etaMin: number }
type Bus = {
  id: string
  number: string
  plate: string
  route: string
  routeName: string
  driver: string
  contact: string
  status: "active" | "inactive"
  currentStopIndex: number
  speed: number
  traffic: number
  passengers: number
  capacity: number
  rating: number
  stations: Station[]
  currentStopName: string
  nextStopName: string
  currentKm: number
  avgSpeed: number
  effectiveSpeed: number
  etaToEndMin: number
  progressPct: number
  stops: Stop[]
  lat: number | null
  lng: number | null
  locationTs: number | null
}
type RouteInfo = { name: string; stations: Station[] }
type Feedback = { bus: string; stars: number; comment: string }
type State = { routes: Record<string, RouteInfo>; buses: Bus[]; feedback: Feedback[] }

type View = "home" | "board" | "track" | "driver" | "feedback"

// ---------- API helpers ----------
// Talk to the Python backend when it's reachable (dev / live preview). On a
// PUBLISHED static site there is no Python process, so we transparently fall
// back to the identical in-browser engine. Once we detect no backend, we stop
// hammering the network and stay local for the session.
let backendDown = false

let driverToken = "" // set after a successful driver login; sent with every driver-only request

async function tryFetch<T>(input: string, init: RequestInit | undefined, fallback: () => T): Promise<T> {
  if (backendDown) return fallback()
  let res: Response
  try {
    res = await fetch(input, { ...init, signal: AbortSignal.timeout?.(4000) })
  } catch {
    backendDown = true
    return fallback()
  }
  if (res.status === 401) {
    window.dispatchEvent(new Event("driver-unauthorized")) // session expired -> back to the gate
    throw new Error("unauthorized")
  }
  if (res.status === 400) return fallback() // bad input: keep using the server afterwards
  if (!res.ok) {
    backendDown = true
    return fallback()
  }
  return (await res.json()) as T
}

const driverHeaders = () => ({ "Content-Type": "application/json", "x-driver-token": driverToken })

const api = {
  state: () => tryFetch<State>("/api/state", undefined, () => localEngine.getState() as State),
  createBus: (body: Record<string, unknown>) =>
    tryFetch(
      "/api/buses",
      { method: "POST", headers: driverHeaders(), body: JSON.stringify(body) },
      () => localEngine.createBus(body),
    ),
  updateBus: (id: string, body: Record<string, unknown>) =>
    tryFetch(
      `/api/buses/${id}`,
      { method: "PATCH", headers: driverHeaders(), body: JSON.stringify(body) },
      () => localEngine.updateBus(id, body),
    ),
  addFeedback: (body: Record<string, unknown>) =>
    tryFetch(
      "/api/feedback",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      () => localEngine.addFeedback(body),
    ),
}

function fmtEta(mins: number): { num: string; unit: string } {
  if (mins <= 0) return { num: "0", unit: "arrived" }
  if (mins < 1) return { num: "<1", unit: "min" }
  if (mins < 60) return { num: Math.round(mins).toString(), unit: "min" }
  return { num: (mins / 60).toFixed(1), unit: "hrs" }
}

// =====================================================================
export default function App() {
  const [state, setState] = useState<State | null>(null)
  // Role is remembered for this browser tab only, so every new visit asks "Student or Driver?" again.
  const ss = {
    get: (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } },
    set: (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { /* ignore */ } },
    del: (k: string) => { try { sessionStorage.removeItem(k) } catch { /* ignore */ } },
  }
  const [role, setRole] = useState<Role | null>(() => {
    const r = ss.get("pu-role"), t = ss.get("pu-token")
    if (r === "driver" && t) { driverToken = t; return "driver" }
    return r === "student" ? "student" : null
  })
  const [view, setView] = useState<View>(() => {
    if (role === "driver") return "driver"
    const v = new URLSearchParams(window.location.search).get("view")
    const ok: string[] = ["home", "board", "track", "feedback"]
    return ok.includes(v ?? "") ? (v as View) : "home" // students can never open "driver"
  })
  const [trackBusId, setTrackBusId] = useState<string | null>(null)
  const [clock, setClock] = useState("--:--:--")
  const [toast, setToast] = useState<{ msg: string; alert: boolean } | null>(null)
  const [pulse, setPulse] = useState(0)
  useEffect(() => { setPulse((p) => p + 1); window.scrollTo(0, 0) }, [view, role])
  useEffect(() => { if (!role) driverToken = "" }, [role]) // clear only after the console has unmounted
  const toastTimer = useRef<number | undefined>(undefined)

  const showToast = (msg: string, alert = false) => {
    setToast({ msg, alert })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }

  const refresh = async () => {
    try {
      const s = await api.state()
      setState(s)
    } catch {
      /* backend not up yet — keep last state */
    }
  }

  // poll the backend so passengers see the driver's manual updates live
  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 4000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-IN", { hour12: false }))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  const enterStudent = () => { ss.set("pu-role", "student"); ss.del("pu-token"); setRole("student"); setView("home") }
  const enterDriver = (token: string) => { driverToken = token; ss.set("pu-role", "driver"); ss.set("pu-token", token); setRole("driver"); setView("driver") }
  const leave = (msg?: string) => {
    ss.del("pu-role"); ss.del("pu-token"); setRole(null); setView("home")
    if (msg) showToast(msg, true)
  }
  useEffect(() => {
    const h = () => leave("Driver session expired — please log in again.")
    window.addEventListener("driver-unauthorized", h)
    return () => window.removeEventListener("driver-unauthorized", h)
  }, [])

  const buses = state?.buses ?? []

  return (
    <div className={!role ? "is-gate" : view === "home" ? "is-home" : "is-app"}>
      <Scene3D mode={role && view === "home" ? "home" : "strip"} pulse={pulse} busNumber={buses[0]?.number ?? "PU-14"} />
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark">PU</div>
            <div className="brand-text">
              <div className="eyebrow">Parul University</div>
              <h1>Campus Bus Transit</h1>
            </div>
          </div>
          {role && (
            <div className="topbar-right">
              <div className="clock">
                <span className="live-dot" />
                <span className="mono">{clock}</span>
              </div>
              {role === "student" ? (
                <nav className="tabs">
                  {(
                    [
                      ["home", "Home"],
                      ["board", "Departures"],
                      ["track", "Track Bus"],
                      ["feedback", "Feedback"],
                    ] as [View, string][]
                  ).map(([v, label]) => (
                    <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>
                      {label}
                    </button>
                  ))}
                </nav>
              ) : (
                <span className="role-pill">Driver Console</span>
              )}
              <button className="switch-btn" onClick={() => leave()}>
                {role === "driver" ? "Log out" : "Switch role"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="shell">
        {!role && <Gate onStudent={enterStudent} onDriver={enterDriver} />}
        {role === "student" && view === "home" && <Home go={setView} />}
        {role && !state && view !== "home" && <div className="empty">Connecting to the transit server…</div>}

        {role === "student" && state && view === "board" && (
          <BoardView
            state={state}
            onTrack={(id) => {
              setTrackBusId(id)
              setView("track")
            }}
          />
        )}

        {role === "student" && state && view === "track" && (
          <TrackView
            buses={buses}
            trackBusId={trackBusId ?? buses[0]?.id ?? null}
            setTrackBusId={setTrackBusId}
            onRate={(num) => {
              setView("feedback")
              setTrackBusId(num) /* reuse to prefill; handled in FeedbackView via number */
            }}
            showToast={showToast}
          />
        )}

        {role === "driver" && state && view === "driver" && (
          <DriverView state={state} showToast={showToast} refresh={refresh} />
        )}

        {role === "student" && state && view === "feedback" && (
          <FeedbackView state={state} showToast={showToast} refresh={refresh} />
        )}
      </div>

      <div id="toast" className={`${toast ? "show" : ""} ${toast?.alert ? "alert" : ""}`}>
        <span className="dot" />
        <span>{toast?.msg}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
function statusMeta(bus: Bus) {
  const parked = bus.status === "inactive"
  const delayed = !parked && bus.traffic < 0.7
  return {
    parked,
    delayed,
    cls: parked ? "status-parked" : delayed ? "status-delayed" : "status-onroute",
    text: parked ? "Parked" : delayed ? "Delayed" : "On route",
  }
}

// ---------------------------------------------------------------------
function BoardView({ state, onTrack }: { state: State; onTrack: (id: string) => void }) {
  const [search, setSearch] = useState("")
  const [routeFilter, setRouteFilter] = useState("all")

  const visible = state.buses.filter((bus) => {
    if (routeFilter !== "all" && bus.route !== routeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const stopMatch = bus.stations.some((s) => s.name.toLowerCase().includes(q))
      if (!stopMatch && !bus.routeName.toLowerCase().includes(q) && !bus.number.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">Live arrivals</p>
          <h2>Next buses from your stop</h2>
          <p>Arrival times are predicted from the driver's reported stop, average speed and traffic — and refresh automatically.</p>
        </div>
      </div>

      <div className="search-row">
        <input
          type="text"
          placeholder="Search a stop — e.g. Waghodia Chokdi, Genda Circle…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="chip-row" style={{ marginBottom: 18 }}>
        <button className={`chip ${routeFilter === "all" ? "active" : ""}`} onClick={() => setRouteFilter("all")}>
          All routes
        </button>
        {Object.entries(state.routes).map(([id, r]) => (
          <button key={id} className={`chip ${routeFilter === id ? "active" : ""}`} onClick={() => setRouteFilter(id)}>
            {r.name}
          </button>
        ))}
      </div>

      <div className="board">
        <div className="board-head">
          <div>Route</div>
          <div>Currently at</div>
          <div>Status</div>
          <div>Arrives at end</div>
          <div>Seats</div>
        </div>
        {visible.length === 0 ? (
          <div className="empty">No buses match that stop right now. Try another search.</div>
        ) : (
          visible.map((bus) => {
            const meta = statusMeta(bus)
            const eta = fmtEta(bus.etaToEndMin)
            return (
              <div
                key={bus.id}
                className={`board-row ${meta.parked ? "parked" : ""}`}
                onClick={() => !meta.parked && onTrack(bus.id)}
              >
                <div>
                  <div className="route-name">{bus.routeName}</div>
                  <div className="bus-tag">
                    {bus.number} • {bus.driver}
                  </div>
                </div>
                <div className="next-stop">
                  {bus.currentStopName}
                  <small>next: {bus.nextStopName}</small>
                </div>
                <div>
                  <span className={`status-pill ${meta.cls}`}>{meta.text}</span>
                </div>
                <div className="eta-cell">
                  <span className="eta-num mono">{meta.parked ? "—" : eta.num}</span>
                  <span className="eta-unit">{meta.parked ? "not running" : eta.unit}</span>
                </div>
                <div className="seats">
                  <b>{bus.passengers}</b>/{bus.capacity} seats
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------
function LiveMap({ bus }: { bus: Bus }) {
  return (
    <div className="card panel">
      <p className="panel-title">
        <span style={{ color: "var(--green)" }}>●</span> Live Google Map
      </p>
      <GoogleLiveMap bus={bus} />
    </div>
  )
}

// ---------------------------------------------------------------------
function BusDetail({ bus, actions }: { bus: Bus; actions?: React.ReactNode }) {
  const [showFormula, setShowFormula] = useState(false)
  const meta = statusMeta(bus)

  return (
    <>
      <div className="track-header">
        <div>
          <h3>
            {bus.number} <span style={{ color: "#8CA1D6", fontWeight: 400 }}>· {bus.plate || "no plate"}</span>
          </h3>
          <div className="sub">
            {bus.driver} · {bus.contact || "—"}
          </div>
          <div className="rating-stars" style={{ marginTop: 8 }}>
            {"★".repeat(Math.round(bus.rating))}
            {"☆".repeat(5 - Math.round(bus.rating))}{" "}
            <span style={{ color: "#B9C4E0", fontSize: 12 }}>{bus.rating.toFixed(1)}</span>
          </div>
        </div>
        <span className={`status-pill ${meta.cls}`}>{meta.text}</span>
      </div>

      <div className="now-at">
        <div className="pin">📍</div>
        <div>
          <div className="now-label">Bus is currently at</div>
          <div className="now-value">{bus.currentStopName}</div>
        </div>
        <div className="now-right">
          <div>
            <b>{bus.passengers}</b>/{bus.capacity} seats filled
          </div>
          <div>
            avg <b>{bus.avgSpeed} km/h</b>
          </div>
        </div>
      </div>

      <div className="track-grid">
        <div className="card">
          <p className="panel-title">Stop-by-stop arrival</p>
          <div className="rail">
            {bus.stops.map((s, i) => {
              const eta = fmtEta(s.etaMin)
              return (
                <div key={i} className={`stop ${s.reached ? "reached" : ""} ${s.current ? "current" : ""}`}>
                  <div className="stop-dot" />
                  <div className="stop-name">{s.name}</div>
                  <div className="stop-meta">{s.km.toFixed(1)} km from origin</div>
                  <div className="stop-eta mono">
                    {s.current ? "Bus is here now" : s.reached ? "Passed" : `${eta.num} ${eta.unit} away`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <LiveMap bus={bus} />

          <div className="card panel">
            <p className="panel-title">Live trip stats</p>
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-num">{bus.avgSpeed}</div>
                <div className="stat-label">Avg speed km/h</div>
              </div>
              <div className="stat">
                <div className="stat-num">{fmtEta(bus.etaToEndMin).num}</div>
                <div className="stat-label">{fmtEta(bus.etaToEndMin).unit} to destination</div>
              </div>
            </div>
          </div>

          <div className="card panel">
            <p className="panel-title">Passengers on board</p>
            <div className="gauge-row">
              <div className="gauge-bar">
                <div className="gauge-fill" style={{ width: `${(bus.passengers / bus.capacity) * 100}%` }} />
              </div>
              <span className="gauge-label">
                {bus.passengers}/{bus.capacity}
              </span>
            </div>
          </div>

          <div className="card panel">
            <p className="panel-title">Trip progress</p>
            <div className="gauge-row">
              <div className="gauge-bar">
                <div className="gauge-fill" style={{ width: `${bus.progressPct}%`, background: "var(--amber)" }} />
              </div>
              <span className="gauge-label">{bus.progressPct}%</span>
            </div>
            <button className="info-toggle" style={{ marginTop: 10 }} onClick={() => setShowFormula((v) => !v)}>
              How is this arrival time calculated?
            </button>
            {showFormula && (
              <div className="formula-box">
                Arrival time = (distance remaining ÷ effective speed) × 60.
                <br />
                Effective speed = average of the driver's reported speeds (<code>{bus.avgSpeed} km/h</code>) × traffic
                multiplier (<code>{bus.traffic}</code>) = <code>{bus.effectiveSpeed} km/h</code>.
                <br />
                Distance remaining is measured from the stop the driver last reported — no GPS required.
              </div>
            )}
          </div>

          {actions}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------
function TrackView({
  buses,
  trackBusId,
  setTrackBusId,
  onRate,
  showToast,
}: {
  buses: Bus[]
  trackBusId: string | null
  setTrackBusId: (id: string) => void
  onRate: (num: string) => void
  showToast: (m: string, a?: boolean) => void
}) {
  const bus = buses.find((b) => b.id === trackBusId) ?? buses[0]
  if (!bus) return <div className="empty">No buses available.</div>

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">Live tracking</p>
          <h2>
            {bus.number} — {bus.routeName}
          </h2>
        </div>
      </div>

      <div className="chip-row" style={{ marginBottom: 18 }}>
        {buses.map((b) => (
          <button key={b.id} className={`chip ${b.id === bus.id ? "active" : ""}`} onClick={() => setTrackBusId(b.id)}>
            {b.number}
          </button>
        ))}
      </div>

      <BusDetail
        bus={bus}
        actions={
          <div className="btn-full-row">
            <button className="btn btn-outline btn-block" onClick={() => onRate(bus.number)}>
              Rate this ride
            </button>
            <button
              className="btn btn-primary btn-block"
              onClick={() => showToast("🚨 SOS sent to campus dispatch.", true)}
            >
              SOS
            </button>
          </div>
        }
      />
    </section>
  )
}

// ---------------------------------------------------------------------
const TRAFFIC = [
  { label: "Light", value: 1.15 },
  { label: "Moderate", value: 0.85 },
  { label: "Heavy", value: 0.5 },
]

function DriverView({
  state,
  showToast,
  refresh,
}: {
  state: State
  showToast: (m: string, a?: boolean) => void
  refresh: () => void
}) {
  const [selectedId, setSelectedId] = useState(state.buses[0]?.id ?? "")
  const [showCreate, setShowCreate] = useState(false)
  const [sharingBusId, setSharingBusId] = useState<string | null>(null)
  const watchId = useRef<number | null>(null)
  const sharingRef = useRef<string | null>(null)
  sharingRef.current = sharingBusId

  const bus = state.buses.find((b) => b.id === selectedId) ?? state.buses[0]

  const stopSharing = (busId: string | null) => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    if (busId) api.updateBus(busId, { lat: null, lng: null })
    setSharingBusId(null)
  }

  const toggleShare = () => {
    if (sharingBusId === bus.id) {
      stopSharing(bus.id)
      showToast("Stopped sharing live location.")
      return
    }
    if (!("geolocation" in navigator)) {
      showToast("Location isn't supported on this device.", true)
      return
    }
    const targetId = bus.id
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (now - ((window as any).__gps || 0) < 4000) return // throttle to save free-tier quota
        ;(window as any).__gps = now
        api.updateBus(targetId, { lat: pos.coords.latitude, lng: pos.coords.longitude }).then(refresh)
      },
      () => {
        showToast("Couldn't get location — please allow location access.", true)
        stopSharing(targetId)
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
    setSharingBusId(targetId)
    showToast("📍 Sharing your live location with riders.")
  }

  // stop the GPS watch when leaving the driver console
  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    if (sharingRef.current) api.updateBus(sharingRef.current, { lat: null, lng: null }).catch(() => {}) // riders stop seeing a stale "live" bus
  }, [])

  // keep a valid selection if buses list changes
  useEffect(() => {
    if (!state.buses.some((b) => b.id === selectedId) && state.buses[0]) {
      setSelectedId(state.buses[0].id)
    }
  }, [state.buses, selectedId])

  const patch = async (body: Record<string, unknown>) => {
    await api.updateBus(bus.id, body)
    refresh()
  }

  if (!bus) return <div className="empty">No buses yet — add one below.</div>

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">Driver console</p>
          <h2>Run today's trip</h2>
          <p>Report your current stop, seats and speed. Students' live view and predicted arrival times update instantly.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Close" : "+ Add a new bus"}
        </button>
      </div>

      {showCreate && (
        <CreateBusForm
          routes={state.routes}
          onCreated={async (id) => {
            setShowCreate(false)
            await refresh()
            setSelectedId(id)
            showToast("New bus added and now live on the board.")
          }}
        />
      )}

      <div className="track-grid">
        <div>
          <div className="card panel">
            <p className="panel-title">Select your bus</p>
            <select value={bus.id} onChange={(e) => setSelectedId(e.target.value)}>
              {state.buses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.number} — {b.routeName}
                </option>
              ))}
            </select>
          </div>

          <div className="card panel">
            <p className="panel-title">Current stop (report your location)</p>
            <select
              value={bus.currentStopIndex}
              onChange={(e) => patch({ currentStopIndex: Number(e.target.value) })}
            >
              {bus.stations.map((s, i) => (
                <option key={i} value={i}>
                  {i + 1}. {s.name} ({s.km.toFixed(1)} km)
                </option>
              ))}
            </select>
            <div className="btn-full-row">
              <button
                className="btn btn-outline btn-block"
                disabled={bus.currentStopIndex <= 0}
                onClick={() => patch({ currentStopIndex: bus.currentStopIndex - 1 })}
              >
                ◀ Previous stop
              </button>
              <button
                className="btn btn-primary btn-block"
                disabled={bus.currentStopIndex >= bus.stations.length - 1}
                onClick={() => patch({ currentStopIndex: bus.currentStopIndex + 1 })}
              >
                Reached next stop ▶
              </button>
            </div>
          </div>

          <div className="card panel">
            <p className="panel-title">Real-time location</p>
            <button
              className={`btn btn-block ${sharingBusId === bus.id ? "btn-danger" : "btn-primary"}`}
              onClick={toggleShare}
            >
              {sharingBusId === bus.id ? "■ Stop sharing location" : "📍 Share my live location"}
            </button>
            <div className="small-note">
              {sharingBusId === bus.id
                ? "Your GPS location is streaming to riders' Track Bus map."
                : "Turns on your phone's GPS so riders see this bus move on a live map."}
            </div>
          </div>

          <div className="card panel">
            <p className="panel-title">Trip status</p>
            <div className="segmented">
              <button className={bus.status === "active" ? "active" : ""} onClick={() => patch({ status: "active" })}>
                On route
              </button>
              <button className={bus.status === "inactive" ? "active" : ""} onClick={() => patch({ status: "inactive" })}>
                Parked
              </button>
            </div>
          </div>

          <div className="card panel">
            <p className="panel-title">Current speed</p>
            <div className="slider-row">
              <input
                type="range"
                min={8}
                max={55}
                value={bus.speed}
                onChange={(e) => patch({ speed: Number(e.target.value) })}
              />
              <span className="mono" style={{ minWidth: 70 }}>
                {bus.speed} km/h
              </span>
            </div>
            <div className="small-note">Rolling average of your reported speeds: {bus.avgSpeed} km/h (used for arrival predictions).</div>
          </div>

          <div className="card panel">
            <p className="panel-title">Traffic condition</p>
            <div className="segmented">
              {TRAFFIC.map((t) => (
                <button key={t.value} className={bus.traffic === t.value ? "active" : ""} onClick={() => patch({ traffic: t.value })}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card panel">
            <p className="panel-title">Passengers on board</p>
            <div className="stepper">
              <button onClick={() => patch({ passengers: bus.passengers - 1 })}>−</button>
              <span className="count mono">{bus.passengers}</span>
              <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>/ {bus.capacity}</span>
              <button onClick={() => patch({ passengers: bus.passengers + 1 })}>+</button>
            </div>
          </div>

          <button
            className="btn btn-danger"
            onClick={() => showToast("🚨 Panic alert broadcast to all riders on this route + campus security.", true)}
          >
            🚨 Panic — Alert Dispatch
          </button>
        </div>

        <div>
          <div className="card">
            <p className="panel-title">What students see right now</p>
            <BusDetail bus={bus} />
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------
function CreateBusForm({
  routes,
  onCreated,
}: {
  routes: Record<string, RouteInfo>
  onCreated: (id: string) => void
}) {
  const routeIds = Object.keys(routes)
  const [form, setForm] = useState({
    number: "",
    plate: "",
    driver: "",
    contact: "",
    route: routeIds[0] ?? "",
    capacity: 50,
    speed: 25,
  })
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.number.trim()) return
    const created = await api.createBus(form)
    if (created?.id) onCreated(created.id)
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <p className="panel-title">Register a new bus</p>
      <div className="form-grid">
        <div className="field">
          <label>Bus number *</label>
          <input type="text" placeholder="PU-31" value={form.number} onChange={(e) => set("number", e.target.value)} />
        </div>
        <div className="field">
          <label>Number plate</label>
          <input type="text" placeholder="GJ06 XV 0000" value={form.plate} onChange={(e) => set("plate", e.target.value)} />
        </div>
        <div className="field">
          <label>Driver name</label>
          <input type="text" placeholder="Full name" value={form.driver} onChange={(e) => set("driver", e.target.value)} />
        </div>
        <div className="field">
          <label>Contact</label>
          <input type="text" placeholder="+91 …" value={form.contact} onChange={(e) => set("contact", e.target.value)} />
        </div>
        <div className="field">
          <label>Route</label>
          <select value={form.route} onChange={(e) => set("route", e.target.value)}>
            {routeIds.map((id) => (
              <option key={id} value={id}>
                {routes[id].name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Seat capacity</label>
          <input type="number" min={1} value={form.capacity} onChange={(e) => set("capacity", Number(e.target.value))} />
        </div>
      </div>
      <button className="btn btn-primary btn-block" onClick={submit}>
        Create bus &amp; start trip
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------
function FeedbackView({
  state,
  showToast,
  refresh,
}: {
  state: State
  showToast: (m: string, a?: boolean) => void
  refresh: () => void
}) {
  const [busNumber, setBusNumber] = useState(state.buses[0]?.number ?? "")
  const [stars, setStars] = useState(5)
  const [comment, setComment] = useState("")

  const submit = async () => {
    if (!comment.trim()) {
      showToast("Add a quick comment before submitting.")
      return
    }
    await api.addFeedback({ bus: busNumber, stars, comment })
    setComment("")
    setStars(5)
    await refresh()
    showToast("Thanks — your feedback was submitted.")
  }

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">Ride feedback</p>
          <h2>Rate your trip</h2>
        </div>
      </div>

      <div className="track-grid">
        <div className="card">
          <div className="field">
            <label>Bus number</label>
            <select value={busNumber} onChange={(e) => setBusNumber(e.target.value)}>
              {state.buses.map((b) => (
                <option key={b.id} value={b.number}>
                  {b.number} — {b.routeName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Rating</label>
            <div style={{ fontSize: 26, letterSpacing: 6, cursor: "pointer" }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} style={{ color: i <= stars ? "var(--amber)" : "var(--line)" }} onClick={() => setStars(i)}>
                  ★
                </span>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Comments</label>
            <textarea
              placeholder="On time, driver was careful, AC was working…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-block" onClick={submit}>
            Submit feedback
          </button>
        </div>

        <div className="card">
          <p className="panel-title">Recent feedback</p>
          {state.feedback.length === 0 ? (
            <div className="empty">No feedback yet.</div>
          ) : (
            state.feedback
              .slice()
              .reverse()
              .map((f, i) => (
                <div className="fb-item" key={i}>
                  <div className="fb-top">
                    <span className="fb-bus">{f.bus}</span>
                    <span className="fb-stars">
                      {"★".repeat(f.stars)}
                      {"☆".repeat(5 - f.stars)}
                    </span>
                  </div>
                  <div className="fb-comment">{f.comment}</div>
                </div>
              ))
          )}
        </div>
      </div>
    </section>
  )
}
