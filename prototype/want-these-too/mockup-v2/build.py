#!/usr/bin/env python3
"""Mockup v2: the v1 selection screen plus a "Your Halloween card" section.

Built by patching ../mockup/build.py's page at build time, so v1 stays untouched.
Cards come from ../../ai-cards/out/ancc-halloween/<photo-id-prefix>-*.png when they exist;
otherwise the tile shows the "still being drawn" placeholder.
"""
import json, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
V1 = HERE.parent / "mockup"
CARDS = HERE.parent.parent / "ai-cards"
OUT = CARDS / "out" / "ancc-halloween"

src = (V1 / "build.py").read_text()
html = re.search(r"html = r'''(.*?)'''\nopen", src, re.S).group(1)

def patch(old, new, count=1):
    global html
    assert html.count(old) == count, f"anchor not found exactly {count}x: {old[:70]!r}"
    html = html.replace(old, new)

# ---- data: v1 examples + one card per example ------------------------------------------------
data = json.loads((V1 / "data.json").read_text())
for ex in data:
    for key in ("mine", "suggested", "near"):
        for p in ex[key]:
            p["src"] = "../mockup/" + p["src"]
            if p.get("chip") and not p["chip"].startswith("data:"): p["chip"] = "../mockup/" + p["chip"]
    # The card is drawn from whichever of the guest's photos has one; the first photo otherwise
    found = [(p, sorted(OUT.glob(p["id"][:12] + "-*.png")) + sorted(OUT.glob(p["id"][:12] + "-*.jpg"))) for p in ex["mine"]]
    lead, ready = next(((p, r) for p, r in found if r), (ex["mine"][0], []))
    ex["cards"] = [{
        "id": "card-" + lead["id"],
        "from": lead["id"],
        "src": ("../../ai-cards/" + str(ready[0].relative_to(CARDS))) if ready else "../../ai-cards/assets/rendering.png",
        "status": "ready" if ready else "rendering",
    }]
html = html.replace("__DATA__", json.dumps(data))

# ---- title + a note in the mockup bar ---------------------------------------------------------
patch("<title>Kiosk mockup — Want these too?</title>", "<title>Kiosk mockup v2 — Halloween card</title>")

# ---- CSS ---------------------------------------------------------------------------------------
patch("  .want h2 { color: #2dd4a8; }", """  .want h2 { color: #2dd4a8; }
  .ai h2 { color: #f3b562; }
  /* The card tile is a photo like any other; a small gold mark says it was drawn, not taken */
  .tile .spark { pointer-events: none; position: absolute; left: 8px; top: 8px; display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: rgba(9,60,109,.85); border: 1px solid #d4ba81; color: #f3dca6; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
  .tile.rendering { cursor: default; }
  .tile.rendering img.photo { filter: none; opacity: 1; }
  .tile.rendering .tick { display: none; }
  .tile.rendering .spark { background: rgba(0,0,0,.6); border-color: #555; color: #bbb; }
  .tile.rendering .spark i { width: 10px; height: 10px; border-radius: 50%; border: 2px solid #f3b562; border-right-color: transparent; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .tile.rendering .view { display: none; }""")

# ---- tile: add the spark badge + rendering state ----------------------------------------------
patch('''function tile(p, extra, group) {
  return `<div class="tile ${picked.has(p.id) ? "on" : ""}" data-id="${p.id}" data-group="${group || "Your photos"}">
    <div class="frame">
      <img class="photo" src="${p.src}" alt="">''', '''function tile(p, extra, group) {
  const badge = p.status ? `<div class="spark">${p.status === "rendering" ? "<i></i> Drawing your card" : "&#10022; Halloween card"}</div>` : "";
  return `<div class="tile ${picked.has(p.id) ? "on" : ""} ${p.status === "rendering" ? "rendering" : ""}" data-id="${p.id}" data-group="${group || "Your photos"}">
    <div class="frame">
      <img class="photo" src="${p.src}" alt="">${badge}''')

# ---- render: the card section sits right under the guest's own photos --------------------------
patch('''    <div class="grid">${ex.mine.map((p) => tile(p)).join("")}</div>`;

  // Suggestions follow''', '''    <div class="grid">${ex.mine.map((p) => tile(p)).join("")}</div>`;

  // The AI card is drawn from the first photo of the session while the guest is choosing.
  // It is offered like any other photo: tap to keep it, View to see it large.
  const cards = ex.cards || [];
  if (cards.length) {
    const ready = cards.filter((c) => c.status === "ready").length;
    html += `<div class="head ai"><h2>Your Halloween card</h2><p>${
      ready ? "Drawn from your photo just now · tap to add it to what you get" : "Being drawn from your photo now — it will appear here in about a minute"}</p></div>
      <div class="grid">${cards.map((c) => tile(c, "", "Your card")).join("")}</div>`;
  }

  // Suggestions follow''')

# ---- cards start ticked when ready, never when still rendering ---------------------------------
patch('''  picked = new Set(ex.mine.map((p) => p.id)); // their own session starts fully ticked''',
      '''  picked = new Set(ex.mine.map((p) => p.id)); // their own session starts fully ticked
  (ex.cards || []).filter((c) => c.status === "ready").forEach((c) => picked.add(c.id));''')

# ---- the summary line counts the card separately -----------------------------------------------
patch('''  const mine = ex.mine.filter((p) => picked.has(p.id)).length;
  const extra = picked.size - mine;
  document.getElementById("summary").innerHTML =
    `${plural(mine, "photo")} from your session` + (extra ? ` <b>+ ${extra} added</b>` : "");''',
      '''  const mine = ex.mine.filter((p) => picked.has(p.id)).length;
  const card = (ex.cards || []).filter((c) => picked.has(c.id)).length;
  const extra = picked.size - mine - card;
  document.getElementById("summary").innerHTML =
    `${plural(mine, "photo")} from your session` + (card ? ` <b>+ your card</b>` : "") + (extra ? ` <b>+ ${extra} added</b>` : "");''')

# ---- a rendering tile can't be tapped ----------------------------------------------------------
patch('''  const t = e.target.closest(".tile");
  if (!t) return;''', '''  const t = e.target.closest(".tile");
  if (!t || t.classList.contains("rendering")) return;''')

# ---- large view: the card travels in the row right after the guest's own photos ----------------
patch('''  const items = [...neighbour("before"), ...inGroup("Your photos")];''',
      '''  const items = [...neighbour("before"), ...inGroup("Your photos"), ...inGroup("Your card")];''')

(HERE / "index.html").write_text(html)
print("wrote", HERE / "index.html", "cards:", [(e["session"], e["cards"][0]["status"]) for e in data])
