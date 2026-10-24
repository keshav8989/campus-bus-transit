# Deploy free on Vercel (no timeouts)

1. Push this folder to GitHub, then vercel.com → Add New → Project → import it (Vite is auto-detected).
2. **Shared live data (needed so the driver's phone and students' phones see the same bus):**
   Project → Storage → Marketplace → **Upstash Redis** (free plan) → connect. Vercel adds the env vars automatically. Redeploy.
3. **Google Maps (optional, free tier):** Google Cloud → enable *Maps JavaScript API* → create a key, restrict it to your Vercel domain →
   Vercel → Settings → Environment Variables → `VITE_GOOGLE_MAPS_API_KEY`. Redeploy.
   Without a key the app uses the keyless Google embed map, which still works.
4. Driver GPS only works over HTTPS (Vercel provides it) and after the driver taps “Share my live location”.

Why it won't time out: the API is one short function (<1s), polling replaces long connections, and GET /api/state is CDN-cached for 3s to stay inside free Redis limits.

Local: `npm install && npm run dev` (Python backend auto-starts).

## Roles & driver password

On every new visit the site asks **Student or Driver**.
- **Student** → full site (Home, Departures, Track Bus, Feedback). No driver console anywhere.
- **Driver** → password, then ONLY the Driver Console (with a Log out button).

Default driver password: **`Parul@Driver2026`**

The password is checked on the server (never inside the website's JavaScript), and every driver action
(update bus, share GPS, add bus) needs a signed login token that expires after 12 hours.

**Change the password without editing code:** Vercel → Project → Settings → Environment Variables →
add `DRIVER_PASSWORD` = your new password (type *Secret*) → Redeploy. Do this if your GitHub repo is public.
