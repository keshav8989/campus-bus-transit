#!/usr/bin/env python3
"""
Builds an editable PowerPoint (.pptx) for the Campus Bus Transit project using
only the Python standard library (no python-pptx / no internet needed).

A .pptx is just a ZIP of Open-XML parts, so we assemble the minimum valid set:
content types, relationships, one slide master + layout, a theme, and one XML
part per slide. Run:  python3 presentation/build_pptx.py
"""

import os
import struct
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "img")
OUT = os.path.join(HERE, "Campus-Bus-Transit.pptx")

# 16:9 slide in EMU (English Metric Units, 914400 per inch)
W, H = 12192000, 6858000
PX = 9525  # EMU per CSS pixel at 96 dpi

NAVY = "12213B"
AMBER = "F2B705"
PAPER = "EEF1F6"
INK = "12213B"
INKSOFT = "5A6480"
BLUE = "2A5CD1"
WHITE = "FFFFFF"
CLOUD = "C6D0EA"


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    w, h = struct.unpack(">II", head[16:24])
    return w, h


# ---- shape builders ---------------------------------------------------------
_sid = [10]


def _next_id():
    _sid[0] += 1
    return _sid[0]


def rect(x, y, cx, cy, fill):
    i = _next_id()
    return f"""<p:sp><p:nvSpPr><p:cNvPr id="{i}" name="bg{i}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>
<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:p/></p:txBody></p:sp>"""


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def para(text, size, color, bold=True, align="l", spc_after=400):
    runs = ""
    b = "1" if bold else "0"
    # allow inline "**bold**" segments
    parts = text.split("**")
    for k, seg in enumerate(parts):
        if seg == "":
            continue
        rb = "1" if (k % 2 == 1 or bold) else "0"
        rc = AMBER if (k % 2 == 1 and color == WHITE) else color
        runs += (f'<a:r><a:rPr lang="en-US" sz="{size}" b="{rb}">'
                 f'<a:solidFill><a:srgbClr val="{rc}"/></a:solidFill>'
                 f'<a:latin typeface="Inter"/></a:rPr><a:t>{esc(seg)}</a:t></a:r>')
    return (f'<a:p><a:pPr algn="{align}"/>{runs}'
            f'<a:endParaRPr lang="en-US" sz="{size}" b="{b}"/></a:p>')


def textbox(x, y, cx, cy, paras, anchor="t"):
    i = _next_id()
    body = "".join(paras)
    return f"""<p:sp><p:nvSpPr><p:cNvPr id="{i}" name="tx{i}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
<p:txBody><a:bodyPr wrap="square" anchor="{anchor}"><a:normAutofit/></a:bodyPr>{body}</p:txBody></p:sp>"""


def picture(rid, x, y, cx, cy):
    i = _next_id()
    return f"""<p:pic><p:nvPicPr><p:cNvPr id="{i}" name="img{i}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
<a:ln w="9525"><a:solidFill><a:srgbClr val="DDE3EE"/></a:solidFill></a:ln></p:spPr></p:pic>"""


def slide_xml(shapes, rels_imgs):
    body = "".join(shapes)
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
{body}</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>"""


# ---- slide content ----------------------------------------------------------
M = 620000  # left/right margin


def title_slide():
    s = [rect(0, 0, W, H, NAVY), rect(0, 0, W, 70000, AMBER)]
    s.append(rect(M, 900000, 620000, 620000, AMBER))
    s.append(textbox(M + 100000, 1000000, 500000, 420000,
                     [para("PU", 2000, NAVY, True, "ctr")], "ctr"))
    s.append(textbox(M, 1720000, 9000000, 500000,
                     [para("PARUL UNIVERSITY  ·  MINOR PROJECT", 1200, CLOUD, True)]))
    s.append(textbox(M, 2250000, 10600000, 2200000, [
        para("Campus Bus Transit", 5400, WHITE, True),
        para("Live Tracker & Arrival Predictor", 5400, WHITE, True),
    ]))
    s.append(textbox(M, 4600000, 9200000, 1100000, [
        para("Drivers report their live stop and GPS location; students see where "
             "their bus is, how full it is, and when it will arrive — powered by a "
             "Python backend.", 1500, CLOUD, False),
    ]))
    return s, []


def bullets_slide(eyebrow, title, items):
    s = [rect(0, 0, W, H, PAPER)]
    s.append(textbox(M, 620000, 10000000, 380000, [para(eyebrow, 1200, BLUE, True)]))
    s.append(textbox(M, 980000, 11000000, 900000, [para(title, 3200, INK, True)]))
    # 2x2 cards
    cw, ch, gap = 5250000, 1550000, 300000
    x0, y0 = M, 2350000
    for idx, (head, desc) in enumerate(items):
        r, c = divmod(idx, 2)
        x = x0 + c * (cw + gap)
        y = y0 + r * (ch + gap)
        s.append(rect(x, y, cw, ch, WHITE))
        s.append(textbox(x + 200000, y + 170000, cw - 400000, ch - 300000, [
            para(head, 1600, INK, True, spc_after=300),
            para(desc, 1250, INKSOFT, False),
        ]))
    return s, []


def shot_slide(eyebrow, title, img_name, callouts):
    s = [rect(0, 0, W, H, PAPER)]
    s.append(textbox(M, 470000, 10000000, 360000, [para(eyebrow, 1150, BLUE, True)]))
    s.append(textbox(M, 800000, 11000000, 780000, [para(title, 2800, INK, True)]))
    # image scaled to fit a band
    w, h = png_size(os.path.join(IMG, img_name))
    max_cy = 3450000
    cx = int(w / h * max_cy)
    if cx > 8600000:
        cx = 8600000
        max_cy = int(h / w * cx)
    ix = (W - cx) // 2
    iy = 1650000
    s.append(picture("rId2", ix, iy, cx, max_cy))
    # callouts row
    cw, gap = 3560000, 300000
    x0 = M
    y = 5450000
    for i, (head, desc) in enumerate(callouts):
        x = x0 + i * (cw + gap)
        s.append(rect(x, y, cw, 1050000, WHITE))
        s.append(rect(x, y, 45000, 1050000, BLUE))
        s.append(textbox(x + 170000, y + 130000, cw - 320000, 820000, [
            para(head, 1250, INK, True, spc_after=250),
            para(desc, 1100, INKSOFT, False),
        ]))
    return s, [img_name]


def arch_slide():
    s = [rect(0, 0, W, H, PAPER)]
    s.append(textbox(M, 620000, 10000000, 380000, [para("SYSTEM DESIGN", 1200, BLUE, True)]))
    s.append(textbox(M, 980000, 11000000, 700000, [para("Architecture", 3200, INK, True)]))
    s.append(textbox(M, 1950000, 10900000, 700000, [
        para("A React single-page app talks to a Python HTTP API. When published as a "
             "static site, it falls back to an identical in-browser engine — so it always works.",
             1450, INKSOFT, False)]))
    nodes = [
        ("FRONTEND", "React + Vite", "Departure board, Track, Driver console & Feedback. Polls the API every 3s and shares GPS via the browser."),
        ("API", "Python backend", "server/app.py serves buses, routes & feedback and computes average speed + arrival predictions."),
        ("FALLBACK", "In-browser engine", "Mirrors the exact same data & maths so the published static site works with no server."),
    ]
    cw, gap = 3560000, 380000
    x0, y = M, 3050000
    for i, (tag, head, desc) in enumerate(nodes):
        x = x0 + i * (cw + gap)
        s.append(rect(x, y, cw, 2350000, WHITE))
        s.append(rect(x + 200000, y - 150000, 1500000, 340000, NAVY))
        s.append(textbox(x + 260000, y - 120000, 1400000, 300000, [para(tag, 1000, WHITE, True)]))
        s.append(textbox(x + 230000, y + 300000, cw - 460000, 1900000, [
            para(head, 1600, INK, True, spc_after=300),
            para(desc, 1200, INKSOFT, False),
        ]))
        if i < 2:
            s.append(textbox(x + cw, y + 900000, gap, 500000, [para("⇄", 2200, BLUE, True, "ctr")]))
    return s, []


def formula_slide():
    s = [rect(0, 0, W, H, PAPER)]
    s.append(textbox(M, 620000, 10000000, 380000, [para("THE MATHS (DONE IN PYTHON)", 1200, BLUE, True)]))
    s.append(textbox(M, 980000, 11000000, 700000, [para("How arrival time is predicted", 3000, INK, True)]))
    bx, by, bw, bh = M, 2200000, W - 2 * M, 3400000
    s.append(rect(bx, by, bw, bh, NAVY))
    s.append(textbox(bx + 420000, by + 400000, bw - 840000, 1500000, [
        para("effective speed = **avg(driver's reported speeds)** × traffic multiplier", 1700, WHITE, False, spc_after=600),
        para("arrival time = ( **distance remaining** ÷ effective speed ) × 60 min", 1700, WHITE, False),
    ]))
    s.append(textbox(bx + 420000, by + 2050000, bw - 840000, 1200000, [
        para("Distance remaining is measured from the stop the driver last reported — "
             "no GPS is needed for the prediction. A rolling average of reported speeds "
             "smooths sudden changes. This transparent model can later be replaced with an "
             "ML model trained on historical GPS + traffic data.", 1300, CLOUD, False),
    ]))
    return s, []


def stack_slide():
    s = [rect(0, 0, W, H, PAPER)]
    s.append(textbox(M, 620000, 10000000, 380000, [para("IMPLEMENTATION", 1200, BLUE, True)]))
    s.append(textbox(M, 980000, 11000000, 700000, [para("Technology stack", 3200, INK, True)]))
    cols = [
        ("FRONTEND", ["React 19", "Vite 8", "Tailwind CSS v4", "TypeScript", "Geolocation API"]),
        ("BACKEND", ["Python 3 (stdlib)", "HTTP JSON REST API", "In-memory data store", "Server-side ETA maths"]),
        ("INTEGRATIONS", ["OpenStreetMap map", "Vite dev proxy -> API", "Auto-launched backend", "Static-publish fallback"]),
    ]
    cw, gap = 3560000, 380000
    x0, y = M, 2350000
    for i, (head, items) in enumerate(cols):
        x = x0 + i * (cw + gap)
        s.append(rect(x, y, cw, 2900000, WHITE))
        paras = [para(head, 1200, BLUE, True, spc_after=400)]
        for it in items:
            paras.append(para("•  " + it, 1350, INK, False, spc_after=250))
        s.append(textbox(x + 230000, y + 230000, cw - 460000, 2450000, paras))
    s.append(textbox(M, 5450000, W - 2 * M, 700000, [
        para("Endpoints:  GET /api/state  ·  POST /api/buses  ·  PATCH /api/buses/:id  ·  POST /api/feedback",
             1250, INKSOFT, False)]))
    return s, []


def end_slide():
    s = [rect(0, 0, W, H, NAVY), rect(0, 0, W, 70000, AMBER)]
    s.append(textbox(M, 2100000, W - 2 * M, 2000000, [
        para("A low-cost, live bus tracker", 3600, WHITE, True, "ctr"),
        para("built for **real campus use**", 3600, WHITE, True, "ctr"),
    ], "ctr"))
    s.append(textbox(M + 900000, 4300000, W - 2 * M - 1800000, 1400000, [
        para("Drivers share their stop and GPS in one tap; students get accurate arrivals, "
             "live seats and a map — with a Python backend doing the predictions.", 1500, CLOUD, False, "ctr"),
        para("Future scope: student login, push notifications, ML-based ETAs, and a persistent database.",
             1500, CLOUD, False, "ctr"),
    ], "ctr"))
    return s, []


SLIDES = [
    title_slide,
    lambda: bullets_slide("THE PROBLEM", "Students wait, without knowing when the bus comes", [
        ("No live position", "Students stand at stops with no idea if the bus already left or is far away."),
        ("Overcrowding", "No visibility into how many seats are free before the bus arrives."),
        ("Guesswork & calls", "Arrival times are shared over phone calls and word of mouth."),
        ("Expensive GPS", "Commercial fleet-tracking hardware is costly on every bus."),
    ]),
    lambda: bullets_slide("OUR SOLUTION", "A driver-reported, GPS-optional tracker", [
        ("Manual stop reporting", "Driver taps 'Reached next stop' — works even with no GPS signal."),
        ("One-tap live GPS", "Optional real-time location streamed to riders on a live map."),
        ("Predicted arrival", "ETA to every stop, computed on the Python server."),
        ("Seats & speed", "Riders see live seat count and average speed before boarding."),
    ]),
    lambda: bullets_slide("FEATURE SET", "What the platform does", [
        ("Live departure board", "All buses, current stop, status, ETA and seats — searchable by route."),
        ("Track a bus", "Stop-by-stop rail, 'here now', live map, avg speed & time-to-destination."),
        ("Driver console", "Report stop, edit seats, set speed & traffic, share GPS, add a new bus."),
        ("Ride feedback", "Students rate trips and leave comments, stored on the backend."),
    ]),
    lambda: shot_slide("SCREEN · PASSENGER", "Live departure board", "board.png", [
        ("Currently at", "The exact stop each bus last reported, plus its next stop."),
        ("Arrives at end", "Predicted minutes to the final campus stop, live."),
        ("Seats", "Real-time occupancy to pick a less-crowded bus."),
    ]),
    lambda: shot_slide("SCREEN · PASSENGER", "Track a bus — live map & ETA", "track.png", [
        ("Live GPS map", "OpenStreetMap marker updates when the driver shares location."),
        ("Stop-by-stop", "Each stop shows passed, here now, or minutes away."),
        ("Avg speed & ETA", "Live trip stats computed by the Python backend."),
    ]),
    lambda: shot_slide("SCREEN · DRIVER", "Driver console & location sharing", "driver.png", [
        ("Share live location", "One tap streams the phone's real GPS to riders."),
        ("Report current stop", "'Reached next stop' moves the bus along the route."),
        ("Add a new bus", "Register a new bus with route, plate and capacity."),
    ]),
    lambda: shot_slide("SCREEN · PASSENGER", "Ride feedback", "feedback.png", [
        ("Star rating", "Riders rate the trip 1-5 stars per bus."),
        ("Comments", "Free-text feedback stored on the Python backend."),
        ("Recent feed", "Latest reviews shown back to the whole campus."),
    ]),
    arch_slide,
    formula_slide,
    stack_slide,
    end_slide,
]


# ---- packaging --------------------------------------------------------------
def build():
    slide_parts = []
    for fn in SLIDES:
        _sid[0] = 10  # reset ids per slide
        shapes, imgs = fn()
        slide_parts.append((shapes, imgs))

    n = len(slide_parts)
    sldid_lst = "".join(
        f'<p:sldId id="{256 + i}" r:id="rId{i + 1}"/>' for i in range(n)
    )
    presentation = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdSM"/></p:sldMasterIdLst>
<p:sldIdLst>{sldid_lst}</p:sldIdLst>
<p:sldSz cx="{W}" cy="{H}"/><p:notesSz cx="{H}" cy="{W}"/></p:presentation>"""

    pres_rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
    for i in range(n):
        pres_rels.append(f'<Relationship Id="rId{i + 1}" '
                         'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" '
                         f'Target="slides/slide{i + 1}.xml"/>')
    pres_rels.append('<Relationship Id="rIdSM" '
                     'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" '
                     'Target="slideMasters/slideMaster1.xml"/>')
    pres_rels.append('<Relationship Id="rIdTheme" '
                     'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" '
                     'Target="theme/theme1.xml"/>')
    pres_rels.append('</Relationships>')

    theme = _theme()
    master = _master()
    master_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
                   '<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'
                   '</Relationships>')
    layout = _layout()
    layout_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
                   '</Relationships>')

    # content types
    overrides = [
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    ]
    for i in range(n):
        overrides.append(f'<Override PartName="/ppt/slides/slide{i + 1}.xml" '
                         'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>')
    content_types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                     '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                     '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                     '<Default Extension="xml" ContentType="application/xml"/>'
                     '<Default Extension="png" ContentType="image/png"/>'
                     + "".join(overrides) + '</Types>')

    root_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
                 '</Relationships>')

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("ppt/presentation.xml", presentation)
        z.writestr("ppt/_rels/presentation.xml.rels", "".join(pres_rels))
        z.writestr("ppt/theme/theme1.xml", theme)
        z.writestr("ppt/slideMasters/slideMaster1.xml", master)
        z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", master_rels)
        z.writestr("ppt/slideLayouts/slideLayout1.xml", layout)
        z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", layout_rels)
        embedded = set()
        for i, (shapes, imgs) in enumerate(slide_parts):
            z.writestr(f"ppt/slides/slide{i + 1}.xml", slide_xml(shapes, imgs))
            rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>']
            if imgs:
                img = imgs[0]
                rels.append(f'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/{img}"/>')
                if img not in embedded:
                    z.write(os.path.join(IMG, img), f"ppt/media/{img}")
                    embedded.add(img)
            rels.append('</Relationships>')
            z.writestr(f"ppt/slides/_rels/slide{i + 1}.xml.rels", "".join(rels))

    print("Wrote", OUT)


def _theme():
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="CampusBus">
<a:themeElements><a:clrScheme name="CampusBus">
<a:dk1><a:srgbClr val="12213B"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1C3363"/></a:dk2><a:lt2><a:srgbClr val="EEF1F6"/></a:lt2>
<a:accent1><a:srgbClr val="2A5CD1"/></a:accent1><a:accent2><a:srgbClr val="F2B705"/></a:accent2>
<a:accent3><a:srgbClr val="1F9D55"/></a:accent3><a:accent4><a:srgbClr val="D7263D"/></a:accent4>
<a:accent5><a:srgbClr val="5A6480"/></a:accent5><a:accent6><a:srgbClr val="9FB0DC"/></a:accent6>
<a:hlink><a:srgbClr val="2A5CD1"/></a:hlink><a:folHlink><a:srgbClr val="5A4A0A"/></a:folHlink></a:clrScheme>
<a:fontScheme name="CampusBus"><a:majorFont><a:latin typeface="Space Grotesk"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Inter"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="CampusBus"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>"""


def _master():
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="{PAPER}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdLayout"/></p:sldLayoutIdLst></p:sldMaster>"""


def _layout():
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sldLayout>"""


if __name__ == "__main__":
    build()
