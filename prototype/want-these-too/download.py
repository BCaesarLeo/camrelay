# Fetch the Easter photos from the hosted gallery and keep a 2048px copy of each.
import json, io, os, sys, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageOps

OUT = os.path.join(os.path.dirname(__file__), "photos")
data = json.load(open("/Users/ssmacpro/dev/studiorelay-gallery/public/events/ANCC2026.json"))
index, seen = [], set()
for tab, seating in data.items():
    for s in seating["sessions"]:
        for p in s["photos"]:
            index.append({"id": p["id"], "tab": tab, "session": s["number"], "filename": p["filename"], "time": s["time"]})
            if p["id"] not in seen:
                seen.add(p["id"])
                p["_fetch"] = True
todo = [(p["id"], p["full"]) for seating in data.values() for s in seating["sessions"] for p in s["photos"] if p.get("_fetch")]
json.dump(index, open(os.path.join(os.path.dirname(__file__), "index.json"), "w"))

def fetch(item):
    pid, url = item
    dest = os.path.join(OUT, pid + ".jpg")
    if os.path.exists(dest):
        return "have"
    try:
        raw = urllib.request.urlopen(urllib.parse.quote(url, safe=":/"), timeout=120).read()
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
        img.thumbnail((2048, 2048), Image.LANCZOS)
        img.save(dest + ".tmp", "JPEG", quality=92)
        os.replace(dest + ".tmp", dest)
        return "ok"
    except Exception as e:
        return f"fail {pid} {type(e).__name__} {e}"

done = {"ok": 0, "have": 0, "fail": 0}
with ThreadPoolExecutor(8) as pool:
    for i, r in enumerate(pool.map(fetch, todo), 1):
        done[r.split()[0]] += 1
        if r.startswith("fail"): print(r, flush=True)
        if i % 100 == 0: print(i, "of", len(todo), done, flush=True)
print("finished", done, flush=True)
