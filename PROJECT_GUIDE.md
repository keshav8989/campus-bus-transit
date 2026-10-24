# Campus Bus Transit — Project Guide

A live campus-bus tracker for Parul University. Drivers report their current stop
and can share live GPS; students see where each bus is, how full it is, its average
speed, and predicted arrival times. Built with a **React frontend** and a **Python backend**.

---

## How it runs

- The **Vite dev server** serves the React app and automatically launches the Python
  backend as a child process (see `vite.config.ts`).
- The frontend calls the backend at `/api/...`, which Vite proxies to the Python
  server on `http://127.0.0.1:5000`.
- On a **published static site** (no Python process), the frontend transparently
  falls back to an identical in-browser engine, so it always works.

---

## What each file does

### Backend (Python)
| File | Role |
|------|------|
| `server/app.py` | The **Python backend / API**. Holds routes, buses and feedback in memory; computes **average speed** and **arrival-time predictions**; serves `GET /api/state`, `POST /api/buses` (create bus), `PATCH /api/buses/:id` (update stop, seats, speed, traffic, status, GPS location), and `POST /api/feedback`. |

### Frontend (React app)
| File | Role |
|------|------|
| `src/App.tsx` | The **whole UI**. Four views — Departures board, Track Bus, Driver Console, Feedback — plus the API layer, live polling, GPS location sharing, the create-bus form, and the passenger live map. |
| `src/busEngine.ts` | The **offline fallback engine**. Mirrors the backend's exact data and maths (average speed, ETA) in TypeScript so the published static site works with no server. |
| `src/index.css` | **Global styles & fonts**. Google Fonts import (Space Grotesk, Inter, IBM Plex Mono), the navy/amber design tokens, and every component style class. |
| `src/main.tsx` | React entry point — mounts `App` into the page and imports `index.css`. |
| `index.html` | The HTML shell Vite loads; contains the `#root` element. |

### Configuration
| File | Role |
|------|------|
| `vite.config.ts` | Build/dev config. Adds the **`/api` proxy** to the Python server and the **plugin that auto-launches `server/app.py`** alongside Vite. |
| `package.json` | Dependencies and scripts (`dev`, `build`, `preview`). |
| `AGENTS.md` / `CLAUDE.md` | Project notes and conventions. |

### Presentation (for submission)
| File | Role |
|------|------|
| `presentation/Campus-Bus-Transit.pptx` | **Editable PowerPoint** — open in PowerPoint / Google Slides, present, and submit. |
| `presentation/Campus-Bus-Transit.pdf` | **PDF version** — universally viewable and submittable; present in full screen. |
| `presentation/index.html` | HTML slide deck (arrow-key navigation); also served online at `/presentation/`. |
| `presentation/img/*.png` | Screenshots of the four app screens used in the deck. |
| `presentation/build_pptx.py` | Script that regenerates the `.pptx` from the screenshots (pure Python). |
| `public/presentation/` | A copy so the deck + PDF + PPTX are reachable on the **published site**. |

---

## Key features at a glance

- **Driver console:** report current stop (or step Previous / Reached next stop),
  edit seats, set speed & traffic, **share live GPS location**, and **add a new bus**.
- **Passenger views:** live departure board, stop-by-stop tracking, a **live map**,
  average speed, and **predicted arrival time** to every stop.
- **Prediction (in Python):** `arrival = (distance remaining ÷ effective speed) × 60`,
  where `effective speed = avg(reported speeds) × traffic multiplier`.

## Running locally
```bash
# frontend + auto-launched backend
npm install
npm run dev

# (backend can also be run on its own)
python3 server/app.py
```
