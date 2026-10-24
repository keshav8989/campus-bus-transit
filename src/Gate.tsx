import { useState } from "react"

export type Role = "student" | "driver"

export default function Gate({ onStudent, onDriver }: { onStudent: () => void; onDriver: (token: string) => void }) {
  const [step, setStep] = useState<"choose" | "login">("choose")
  const [pw, setPw] = useState("")
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pw || busy) return
    setBusy(true)
    setErr("")
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
        signal: AbortSignal.timeout?.(8000),
      })
      if (res.status === 401) setErr("Wrong password. Please try again.")
      else if (!res.ok) setErr("Server problem. Please try again in a moment.")
      else onDriver((await res.json()).token)
    } catch {
      setErr("Can't reach the server. Check your internet and try again.")
    }
    setBusy(false)
  }

  return (
    <div className="gate">
      <div className="gate-head">
        <p className="eyebrow">Parul University</p>
        <h2>Welcome aboard.</h2>
        <p>Who's riding today?</p>
      </div>

      {step === "choose" ? (
        <div className="gate-cards">
          <button className="gate-card" onClick={onStudent}>
            <span className="gate-ico">🎓</span>
            <b>I'm a Student</b>
            <small>Live departures, track your bus, feedback</small>
          </button>
          <button className="gate-card driver" onClick={() => setStep("login")}>
            <span className="gate-ico">🚌</span>
            <b>I'm a Driver</b>
            <small>Password required</small>
          </button>
        </div>
      ) : (
        <form className="gate-login" onSubmit={login}>
          <b>Driver login</b>
          <div className="pw-row">
            <input
              autoFocus
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Enter driver password"
              autoComplete="current-password"
              aria-label="Driver password"
            />
            <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label="Show or hide password">
              {show ? "Hide" : "Show"}
            </button>
          </div>
          {err && <div className="gate-err" role="alert">{err}</div>}
          <div className="gate-actions">
            <button type="button" className="btn btn-outline" onClick={() => { setStep("choose"); setErr(""); setPw("") }}>← Back</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !pw}>{busy ? "Checking…" : "Enter console →"}</button>
          </div>
        </form>
      )}
    </div>
  )
}
