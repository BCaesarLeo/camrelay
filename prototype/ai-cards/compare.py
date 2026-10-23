#!/usr/bin/env python3
"""Side-by-side sheet: each original photo next to its generated card(s)."""
import sys, glob
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
HERE = Path(__file__).resolve().parent
OUT = HERE / "out" / "ancc-halloween"
H = 640
rows = []
for photo in sorted((HERE / "samples").glob("*.jpg")):
    cards = sorted(OUT.glob(photo.stem[:12] + "-*.jpg")) + sorted(OUT.glob(photo.stem[:12] + "-*.png"))
    if cards: rows.append((photo, cards))
if not rows: sys.exit("no cards yet")
ims = []
for photo, cards in rows:
    tiles = [Image.open(photo).convert("RGB")] + [Image.open(c).convert("RGB") for c in cards]
    tiles = [t.resize((round(t.width * H / t.height), H)) for t in tiles]
    row = Image.new("RGB", (sum(t.width for t in tiles) + 16 * (len(tiles) + 1), H + 40), "#111")
    x = 16
    d = ImageDraw.Draw(row)
    for i, t in enumerate(tiles):
        row.paste(t, (x, 32)); d.text((x, 8), "original" if i == 0 else cards[i - 1].name, fill="#ddd"); x += t.width + 16
    ims.append(row)
W = max(r.width for r in ims)
sheet = Image.new("RGB", (W, sum(r.height for r in ims)), "#111")
y = 0
for r in ims: sheet.paste(r, (0, y)); y += r.height
out = HERE / "out" / "compare.jpg"; sheet.save(out, quality=88); print(out, sheet.size)
