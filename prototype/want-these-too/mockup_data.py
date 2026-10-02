# Pick real example sessions from the Easter trial and work out what the kiosk would suggest.
import json, os, base64, collections
import numpy as np, cv2
HERE = os.path.dirname(os.path.abspath(__file__))
meta = json.load(open(f"{HERE}/out/faces.json")); data = np.load(f"{HERE}/out/faces.npz")
faces, crops, E = meta["faces"], data["crops"], data["sface"]
index = json.load(open(f"{HERE}/index.json"))
S = E @ E.T
MATCH, STRONG = 0.70, 0.80

key = lambda f: (f["tab"], str(f["session"]))
sess_photos = collections.OrderedDict()
for e in index:
    k = (e["tab"], str(e["session"]))
    if e["id"] in meta["photos"] and (meta["photos"][e["id"]]["tab"], str(meta["photos"][e["id"]]["session"])) == k:
        sess_photos.setdefault(k, [])
        if e["id"] not in sess_photos[k]: sess_photos[k].append(e["id"])
by_photo = collections.defaultdict(list)
for i, f in enumerate(faces): by_photo[f["photo"]].append(i)
numeric = {k: int(k[1]) for k in sess_photos if k[1].isdigit()}
order = {tab: sorted([k for k in numeric if k[0] == tab], key=lambda k: numeric[k]) for tab in {k[0] for k in numeric}}
TAB = {"930": "9:30", "100": "1:00", "400": "4:00"}

def suggestions(k):
    mine = [i for p in sess_photos[k] for i in by_photo[p]]
    out = {}
    for other, plist in sess_photos.items():
        if other == k or not other[1].isdigit(): continue
        for p in plist:
            theirs = by_photo[p]
            if not theirs or not mine: continue
            sub = S[np.ix_(theirs, mine)]
            sub = np.where(sub > 0.985, -1, sub)  # the very same image filed twice
            best = sub.max(axis=1)
            hits = [(theirs[j], mine[int(sub[j].argmax())], float(best[j])) for j in range(len(theirs)) if best[j] >= MATCH]
            # guard against look-alike babies: two different people must match, or one very strongly
            if len({h[0] for h in hits}) >= 2 and len({h[1] for h in hits}) >= 2 or any(h[2] >= STRONG for h in hits):
                top = max(hits, key=lambda h: h[2])
                out[p] = {"session": other, "score": top[2], "face": top[0], "people": len(hits), "via": sorted({faces[h[1]]["photo"] for h in hits})}
    return out

cands = []
for k in numeric:
    n = len(sess_photos[k])
    if not 3 <= n <= 9: continue
    sug = suggestions(k)
    if 1 <= len(sug) <= 8:
        cands.append((k, sug))
# a spread: same family split over neighbouring sessions, a return visit in another seating, and nothing found
def kind(k, sug):
    others = {v["session"] for v in sug.values()}
    if any(o[0] != k[0] for o in others): return "later seating"
    if any(abs(numeric[o] - numeric[k]) == 1 for o in others): return "next session"
    return "same seating"
picked, seen = [], set()
for want in ("next session", "later seating", "same seating"):
    for k, sug in sorted(cands, key=lambda c: -np.mean([v["score"] for v in c[1].values()])):
        if kind(k, sug) == want and k not in seen:
            picked.append((k, sug, want)); seen.add(k); break
none = next(k for k in numeric if 4 <= len(sess_photos[k]) <= 6 and not suggestions(k) and k not in seen)
picked.append((none, {}, "nothing found"))

used = set()
def img(pid):
    if pid not in used:
        used.add(pid)
        im = cv2.imread(f"{HERE}/photos/{pid}.jpg")
        s = 1000 / max(im.shape[:2])
        cv2.imwrite(f"{HERE}/mockup/img/{pid}.jpg", cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 82])
    return f"img/{pid}.jpg"
def chip(i):
    ok, buf = cv2.imencode(".jpg", cv2.resize(crops[i], (72, 72)), [cv2.IMWRITE_JPEG_QUALITY, 80])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()

examples = []
for k, sug, why in picked:
    seq = order[k[0]]; pos = seq.index(k)
    near = []
    # The session before / after: the nearest one in each direction that still has photos
    # the guest hasn't already been offered as a face match
    for label, step in (("before", -1), ("after", 1)):
        j = pos + step
        while 0 <= j < len(seq) and all(p in sug for p in sess_photos[seq[j]]):
            j += step
        if 0 <= j < len(seq):
            near += [{"id": p, "src": img(p), "when": label, "session": seq[j][1]} for p in sess_photos[seq[j]] if p not in sug][:8]
    examples.append({
        "label": f"{TAB[k[0]]} seating · session {k[1]} ({why})",
        "session": k[1], "seating": TAB[k[0]],
        "mine": [{"id": p, "src": img(p)} for p in sess_photos[k]],
        "suggested": [{"id": p, "src": img(p), "session": v["session"][1], "seating": TAB[v["session"][0]], "score": round(v["score"], 2), "people": v["people"], "via": v["via"], "chip": chip(v["face"])}
                      for p, v in sorted(sug.items(), key=lambda kv: -kv[1]["score"])],
        "near": near,
    })
    print(k, why, "| mine", len(sess_photos[k]), "| suggested", [(v["session"][1], round(v["score"], 2), v["people"]) for v in sug.values()], "| near", len(near))
json.dump(examples, open(f"{HERE}/mockup/data.json", "w"))
print("images:", len(used))
