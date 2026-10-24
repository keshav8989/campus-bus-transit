type Go = (v: "board" | "track" | "feedback") => void

const PANELS = [
  { side: "left", eyebrow: "Parul University", title: "Every campus bus,\nlive on your phone.", body: "Scroll to ride along. See where your bus is, how full it is and exactly when it reaches your stop.", cta: ["Open live departures", "board"] },
  { side: "right", eyebrow: "Live Google Map", title: "Watch it move\nin real time.", body: "The driver's phone streams GPS to a real Google Map. Your bus glides along the road with a live trail.", cta: ["Track a bus", "track"] },
  { side: "left", eyebrow: "Smart arrival times", title: "Know before\nyou leave.", body: "ETA = distance remaining ÷ effective speed, using the driver's average speed and traffic — for every stop on the route.", cta: ["See departures", "board"] },
  { side: "right", eyebrow: "Driver updates", title: "Drivers keep it\naccurate.", body: "Drivers report stops, seats, speed and traffic from the road, so what you see here is always up to date.", cta: ["See departures", "board"] },
  { side: "left", eyebrow: "Ride feedback", title: "Rate every ride.", body: "Tell the transport team how the trip went so routes and drivers keep improving.", cta: ["Give feedback", "feedback"] },
] as const

export default function Home({ go }: { go: Go }) {
  return (
    <div className="home">
      {PANELS.map((p, i) => (
        <section key={i} className={`story ${p.side}`}>
          <div className="story-card">
            <p className="eyebrow">{p.eyebrow}</p>
            <h2 style={{ whiteSpace: "pre-line" }}>{p.title}</h2>
            <p>{p.body}</p>
            <button className="btn btn-primary" onClick={() => go(p.cta[1] as any)}>{p.cta[0]} →</button>
          </div>
          {i === 0 && <div className="scroll-hint">Scroll to drive ↓</div>}
        </section>
      ))}
    </div>
  )
}
