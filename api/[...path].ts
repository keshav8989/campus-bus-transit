// One fast serverless function (finishes in well under Vercel's free 10s limit).
// State lives in Upstash Redis (free) so driver + students share the same data.
import { createHmac, createHash, timingSafeEqual } from "node:crypto"
import { localEngine, persist } from "../src/busEngine.js"

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = "pu-bus-state"

// ---- Driver login -------------------------------------------------------
// Default password below. To change it WITHOUT touching code, set DRIVER_PASSWORD
// in Vercel -> Settings -> Environment Variables and redeploy.
const PASSWORD = process.env.DRIVER_PASSWORD || "Parul@Driver2026"
const sha = (s: string) => createHash("sha256").update(s).digest()
const sign = (exp: number) => createHmac("sha256", sha(PASSWORD + "|pu-bus")).update(String(exp)).digest("hex")
const makeToken = () => { const exp = Date.now() + 12 * 3600_000; return `${exp}.${sign(exp)}` } // valid 12 h
const tokenOk = (t: unknown) => {
  const [e, sig] = String(t || "").split(".")
  if (!e || !sig || !(+e > Date.now())) return false
  const a = Buffer.from(sig), b = Buffer.from(sign(+e))
  return a.length === b.length && timingSafeEqual(a, b)
}
const passwordOk = (p: unknown) => timingSafeEqual(sha(String(p ?? "")), sha(PASSWORD))

async function redis(cmd: unknown[]) {
  const r = await fetch(URL_!, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(cmd) })
  return (await r.json()) as { result: string | null }
}

export default async function handler(req: any, res: any) {
  const parts = String(req.url).split("?")[0].replace(/^\/api\/?/, "").split("/").filter(Boolean)
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}
  res.setHeader("Cache-Control", "no-store")
  try {
    // POST /api/login  -> { token }   (short delay on a wrong password slows guessing)
    if (req.method === "POST" && parts[0] === "login") {
      if (passwordOk(body.password)) return res.status(200).json({ token: makeToken() })
      await new Promise((r) => setTimeout(r, 700))
      return res.status(401).json({ error: "wrong password" })
    }

    const driverOnly = (req.method === "POST" && parts[0] === "buses") || (req.method === "PATCH" && parts[0] === "buses")
    if (driverOnly && !tokenOk(req.headers["x-driver-token"])) return res.status(401).json({ error: "driver login required" })

    if (URL_) {
      const { result } = await redis(["GET", KEY])
      if (result) persist.load(JSON.parse(result))
    }
    let out: unknown = null, code = 200
    if (req.method === "GET" && parts[0] === "state") {
      res.setHeader("Cache-Control", "public, s-maxage=3, stale-while-revalidate=6") // keeps Redis usage low
      return res.status(200).json(localEngine.getState())
    }
    if (req.method === "POST" && parts[0] === "buses") { out = localEngine.createBus(body); code = 201 }
    else if (req.method === "PATCH" && parts[0] === "buses" && parts[1]) out = localEngine.updateBus(parts[1], body)
    else if (req.method === "POST" && parts[0] === "feedback") { out = localEngine.addFeedback(body); code = 201 }
    else return res.status(404).json({ error: "not found" })
    if (!out) return res.status(400).json({ error: "bad request" })
    if (URL_) await redis(["SET", KEY, JSON.stringify(persist.dump())])
    return res.status(code).json(out)
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}
