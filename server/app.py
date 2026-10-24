#!/usr/bin/env python3
"""
Parul University Campus Bus Transit — backend API.

Pure Python standard library (no external packages needed), so it runs
anywhere Python 3 is installed. Holds routes, buses and feedback in memory
and does the arrival-time / average-speed maths on the server.

Key idea for this project: there is NO GPS. The driver manually reports which
stop the bus is currently at (`currentStopIndex`) plus its current speed. The
server keeps a rolling history of reported speeds per bus, computes an average
speed, and from that predicts the arrival time to every remaining stop.

Run:  python3 server/app.py       (listens on 127.0.0.1:5000)
"""

import json
import os
import hmac
import hashlib
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = 5000

# ---------------------------------------------------------------------------
# In-memory data store (swap for a database to persist across restarts).
# ---------------------------------------------------------------------------
LOCK = threading.Lock()

ROUTES = {
    "r1": {
        "name": "Vadodara Railway Station Line",
        "stations": [
            {"name": "Vadodara Railway Station", "km": 0},
            {"name": "Genda Circle", "km": 4.2},
            {"name": "Gorwa", "km": 9.6},
            {"name": "Waghodia Chokdi", "km": 15.8},
            {"name": "Parul Campus Main Gate", "km": 21.5},
            {"name": "Academic Block 5", "km": 22.7},
        ],
    },
    "r2": {
        "name": "Karelibaug — Sama Line",
        "stations": [
            {"name": "Karelibaug", "km": 0},
            {"name": "Sama Savli Road", "km": 5.1},
            {"name": "Harni", "km": 10.4},
            {"name": "Waghodia Road", "km": 16.9},
            {"name": "Parul Campus", "km": 20.3},
        ],
    },
    "r3": {
        "name": "Ajwa — Chhani Line",
        "stations": [
            {"name": "Ajwa Road", "km": 0},
            {"name": "Chhani", "km": 6.7},
            {"name": "Waghodia", "km": 13.2},
            {"name": "Parul Campus", "km": 18.4},
        ],
    },
}

BUSES = [
    {
        "id": "pu14", "number": "PU-14", "plate": "GJ06 XV 4471", "route": "r1",
        "driver": "Ramesh Patel", "contact": "+91 98250 11122", "status": "active",
        "currentStopIndex": 1, "speed": 28, "traffic": 0.85, "passengers": 34,
        "capacity": 60, "rating": 4.4, "speedHistory": [26, 30, 28],
        "lat": None, "lng": None, "locationTs": None,
    },
    {
        "id": "pu22", "number": "PU-22", "plate": "GJ06 XV 8890", "route": "r2",
        "driver": "Sanjay Chauhan", "contact": "+91 98250 33445", "status": "active",
        "currentStopIndex": 2, "speed": 24, "traffic": 0.85, "passengers": 51,
        "capacity": 60, "rating": 4.1, "speedHistory": [22, 25, 24],
        "lat": None, "lng": None, "locationTs": None,
    },
    {
        "id": "pu08", "number": "PU-08", "plate": "GJ06 XV 2207", "route": "r3",
        "driver": "Vikram Solanki", "contact": "+91 98250 55667", "status": "inactive",
        "currentStopIndex": 0, "speed": 26, "traffic": 0.85, "passengers": 0,
        "capacity": 50, "rating": 4.7, "speedHistory": [26],
        "lat": None, "lng": None, "locationTs": None,
    },
]

FEEDBACK = [
    {"bus": "PU-14", "stars": 5, "comment": "Right on time this morning, driver announced each stop."},
    {"bus": "PU-22", "stars": 4, "comment": "A little crowded near Harni but predicted ETA was accurate."},
]

_next_id = [100]


# ---------------------------------------------------------------------------
# Prediction maths
# ---------------------------------------------------------------------------
def avg_speed(bus):
    """Average of every speed the driver has reported this trip."""
    hist = bus.get("speedHistory") or [bus["speed"]]
    return sum(hist) / len(hist)


def effective_speed(bus):
    """Average speed dampened by the driver-reported traffic multiplier."""
    return max(4.0, avg_speed(bus) * bus["traffic"])


def enrich(bus):
    """Return a copy of the bus with server-computed live fields for the UI."""
    route = ROUTES[bus["route"]]
    stations = route["stations"]
    idx = max(0, min(bus["currentStopIndex"], len(stations) - 1))
    current_km = stations[idx]["km"]
    eff = effective_speed(bus)

    stops = []
    for i, s in enumerate(stations):
        remaining = s["km"] - current_km
        reached = i <= idx
        eta = 0.0 if remaining <= 0 else (remaining / eff) * 60.0
        stops.append({
            "name": s["name"], "km": s["km"],
            "reached": reached,
            "current": i == idx,
            "etaMin": round(eta, 1),
        })

    total_km = stations[-1]["km"]
    remaining_to_end = max(0.0, total_km - current_km)
    eta_to_end = 0.0 if remaining_to_end <= 0 else (remaining_to_end / eff) * 60.0

    return {
        **{k: v for k, v in bus.items() if k != "speedHistory"},
        "routeName": route["name"],
        "stations": stations,
        "currentStopName": stations[idx]["name"],
        "nextStopName": stations[min(idx + 1, len(stations) - 1)]["name"],
        "currentKm": round(current_km, 1),
        "avgSpeed": round(avg_speed(bus), 1),
        "effectiveSpeed": round(eff, 1),
        "etaToEndMin": round(eta_to_end, 1),
        "progressPct": round(min(100.0, (current_km / total_km) * 100) if total_km else 0, 0),
        "stops": stops,
    }


def snapshot():
    with LOCK:
        return {
            "routes": ROUTES,
            "buses": [enrich(b) for b in BUSES],
            "feedback": FEEDBACK,
        }


def find_bus(bus_id):
    return next((b for b in BUSES if b["id"] == bus_id), None)


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------
PASSWORD = os.environ.get("DRIVER_PASSWORD", "Parul@Driver2026")


def _sign(exp):
    key = hashlib.sha256((PASSWORD + "|pu-bus").encode()).digest()
    return hmac.new(key, str(exp).encode(), hashlib.sha256).hexdigest()


def make_token():
    exp = int(time.time() * 1000) + 12 * 3600 * 1000
    return f"{exp}.{_sign(exp)}"


def token_ok(t):
    try:
        e, sig = (t or "").split(".")
        return int(e) > time.time() * 1000 and hmac.compare_digest(sig, _sign(int(e)))
    except Exception:
        return False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # keep the console quiet

    def _send(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Driver-Token")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return {}

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path.rstrip("/") == "/api/state":
            self._send(200, snapshot())
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.rstrip("/")
        data = self._body()

        if path == "/api/login":
            if hmac.compare_digest(str(data.get("password", "")), PASSWORD):
                return self._send(200, {"token": make_token()})
            time.sleep(0.7)
            return self._send(401, {"error": "wrong password"})
        if path == "/api/buses":
            if not token_ok(self.headers.get("X-Driver-Token")):
                return self._send(401, {"error": "driver login required"})
            return self._create_bus(data)
        if path == "/api/feedback":
            return self._add_feedback(data)
        self._send(404, {"error": "not found"})

    def do_PATCH(self):
        parts = self.path.rstrip("/").split("/")
        if len(parts) == 4 and parts[1] == "api" and parts[2] == "buses":
            if not token_ok(self.headers.get("X-Driver-Token")):
                return self._send(401, {"error": "driver login required"})
            return self._update_bus(parts[3], self._body())
        self._send(404, {"error": "not found"})

    # -- actions ------------------------------------------------------------
    def _create_bus(self, data):
        route = data.get("route")
        if route not in ROUTES:
            return self._send(400, {"error": "unknown route"})
        with LOCK:
            _next_id[0] += 1
            new_bus = {
                "id": f"bus{_next_id[0]}",
                "number": (data.get("number") or f"PU-{_next_id[0]}").strip(),
                "plate": (data.get("plate") or "").strip(),
                "route": route,
                "driver": (data.get("driver") or "Driver").strip(),
                "contact": (data.get("contact") or "").strip(),
                "status": "active",
                "currentStopIndex": 0,
                "speed": int(data.get("speed") or 25),
                "traffic": 0.85,
                "passengers": 0,
                "capacity": int(data.get("capacity") or 50),
                "rating": 5.0,
                "speedHistory": [int(data.get("speed") or 25)],
                "lat": None, "lng": None, "locationTs": None,
            }
            BUSES.append(new_bus)
            result = enrich(new_bus)
        self._send(201, result)

    def _update_bus(self, bus_id, data):
        with LOCK:
            bus = find_bus(bus_id)
            if not bus:
                return self._send(404, {"error": "bus not found"})
            stations = ROUTES[bus["route"]]["stations"]

            if "currentStopIndex" in data:
                bus["currentStopIndex"] = max(0, min(int(data["currentStopIndex"]), len(stations) - 1))
            if "passengers" in data:
                bus["passengers"] = max(0, min(int(data["passengers"]), bus["capacity"]))
            if "capacity" in data:
                bus["capacity"] = max(1, int(data["capacity"]))
                bus["passengers"] = min(bus["passengers"], bus["capacity"])
            if "traffic" in data:
                bus["traffic"] = float(data["traffic"])
            if "status" in data:
                bus["status"] = "active" if data["status"] == "active" else "inactive"
            if "lat" in data and "lng" in data:
                if data["lat"] is None:
                    bus["lat"] = bus["lng"] = bus["locationTs"] = None  # stopped sharing
                else:
                    bus["lat"] = float(data["lat"])
                    bus["lng"] = float(data["lng"])
                    bus["locationTs"] = time.time()
            if "speed" in data:
                bus["speed"] = int(data["speed"])
                bus.setdefault("speedHistory", []).append(bus["speed"])
                bus["speedHistory"] = bus["speedHistory"][-40:]  # keep it bounded

            result = enrich(bus)
        self._send(200, result)

    def _add_feedback(self, data):
        comment = (data.get("comment") or "").strip()
        if not comment:
            return self._send(400, {"error": "comment required"})
        entry = {
            "bus": data.get("bus") or "",
            "stars": max(1, min(int(data.get("stars") or 5), 5)),
            "comment": comment,
        }
        with LOCK:
            FEEDBACK.append(entry)
        self._send(201, entry)


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Bus transit API running on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
