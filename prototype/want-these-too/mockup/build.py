import json
data = open("data.json").read()
html = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>Kiosk mockup — Want these too?</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  html, body { height: 100%; }
  body { touch-action: manipulation; overscroll-behavior: none; background: #050505; color: #f0f0f0; font: 15px/1.4 Inter, -apple-system, system-ui, sans-serif; display: flex; flex-direction: column; user-select: none; }
  button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }

  /* mockup controls — not part of the kiosk */
  .mock { flex-shrink: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 10px 16px; background: #1a1608; border-bottom: 1px solid rgba(243,181,98,.3); font-size: 13px; color: #f3b562; }
  .mock select { background: #0a0a0a; color: #f0f0f0; border: 1px solid #333; padding: 6px 8px; font: inherit; max-width: 100%; }
  .mock span { color: #9a8a66; }

  .top { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 24px; }
  .back { min-height: 48px; border: 1px solid #2a2a2a; color: #888; padding: 10px 22px 10px 16px; font-size: 15px; letter-spacing: .05em; }
  .label { font-size: 13px; font-weight: 300; letter-spacing: .12em; text-transform: uppercase; color: #555; text-align: center; }
  .label b { color: #333; font-weight: 300; margin-left: 8px; }

  .scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 24px 24px; }
  .head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; padding: 20px 4px 12px; }
  .head h2 { font-size: 13px; font-weight: 400; letter-spacing: .12em; text-transform: uppercase; color: #e0e0e0; }
  .head p { font-size: 13px; font-weight: 300; color: #666; }
  .head .all { margin-left: auto; min-height: 44px; border: 1px solid #2a2a2a; color: #888; padding: 8px 18px; font-size: 13px; letter-spacing: .06em; }
  .want h2 { color: #2dd4a8; }

  /* Row height follows the screen, so an iPad shows a useful number of photos either way up */
  .grid { display: flex; flex-wrap: wrap; gap: 8px; --h: clamp(190px, 30vh, 300px); }
  .grid.small { --h: clamp(130px, 19vh, 190px); }
  /* A tile is exactly as wide as its photo; the caption wraps underneath rather than widening it */
  .tile { width: min-content; border: 3px solid transparent; background: #111; cursor: pointer; transition: border-color .15s; }
  .frame { position: relative; }
  /* The whole photo is always shown: the tile takes the photo's own shape, nothing is cropped */
  .tile img.photo { display: block; height: var(--h); width: auto; max-width: calc(100vw - 54px); object-fit: contain; transition: filter .2s, opacity .2s; pointer-events: none; }
  .tile.on { border-color: #2dd4a8; }
  .tile:not(.on) img.photo { filter: saturate(.5) brightness(.8); opacity: .65; }
  /* The circle only shows the state — the whole photo is the button */
  .tick { pointer-events: none; position: absolute; top: 8px; right: 8px; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.35); border: 2px solid rgba(255,255,255,.85); }
  .tile.on .tick { background: #2dd4a8; border-color: #2dd4a8; }
  .tick svg { opacity: 0; } .tile.on .tick svg { opacity: 1; }
  /* Looking closer is a separate, labelled button under the photo, so it can't be hit by accident */
  .view { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 46px; border-top: 1px solid #1e1e1e; color: #9a9a9a; font-size: 13px; letter-spacing: .06em; }
  .view svg { width: 16px; height: 16px; flex-shrink: 0; }
  .view:active { background: #1a1a1a; }
  /* Everything said about a photo sits under it, never on top of it */
  .cap { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; padding: 6px 8px; font-size: 12px; line-height: 1.3; color: #bbb; }
  .cap img { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; display: block; flex-shrink: 0; }
  .cap b { font-weight: 400; flex: 1; min-width: 0; }
  .cap span { color: #666; width: 100%; }
  .grid.small .tick { width: 36px; height: 36px; }

  .more { display: block; width: 100%; min-height: 64px; margin-top: 20px; padding: 16px; border: 1px dashed #2a2a2a; color: #888; font-size: 14px; letter-spacing: .04em; }
  .none { padding: 4px 4px 0; font-size: 14px; font-weight: 300; color: #555; }

  .bar { flex-shrink: 0; display: flex; align-items: center; gap: 16px; padding: 14px 24px max(16px, env(safe-area-inset-bottom)); border-top: 1px solid #1a1a1a; background: #0a0a0a; }
  .bar p { font-size: 13px; font-weight: 300; color: #777; flex: 1; min-width: 0; }
  .bar p b { color: #2dd4a8; font-weight: 400; }
  .go { flex-shrink: 0; min-height: 64px; padding: 18px 40px; background: #4353ff; color: #fff; font-size: 14px; letter-spacing: .12em; text-transform: uppercase; }
  .go:disabled { opacity: .4; }

  /* Tap a photo to look at it properly; choose it from there, or step to the next one */
  .light { position: fixed; inset: 0; z-index: 10; background: #050505; display: none; flex-direction: column; }
  .light.show { display: flex; }
  .light .bartop { flex-shrink: 0; display: flex; align-items: center; gap: 16px; padding: max(14px, env(safe-area-inset-top)) 20px 6px; }
  .light .close { display: flex; align-items: center; gap: 8px; min-height: 60px; padding: 0 30px 0 20px; border: 1px solid #3a3a3a; background: #141414; color: #f0f0f0; font-size: 18px; letter-spacing: .04em; }
  .light .close svg { width: 22px; height: 22px; }
  .light .where { flex: 1; min-width: 0; text-align: right; font-size: 13px; font-weight: 300; color: #777; }
  /* A carousel: the photo being looked at is large in the middle, its neighbours sit smaller and
     half-coloured on either side. Swipe to move along; a photo grows as it reaches the middle and
     shrinks as it leaves. Tap a side photo to bring it in; tap the middle photo to select it. */
  .light .stage { flex: 1; min-height: 0; position: relative; overflow: hidden; touch-action: pan-y; overscroll-behavior: none; }
  .slide { position: absolute; left: 50%; top: 50%; padding: 0; border: 4px solid transparent; background: #111; will-change: transform, filter; }
  .slide img { display: block; width: 100%; height: 100%; pointer-events: none; }
  /* Cards travel in the row like photos. A divider says why the next photos are there and is passed
     over while swiping; the last card offers the neighbouring sessions once the guest reaches the end. */
  .slide.card { display: block; padding: 0; background: #0d0d0d; border: none; color: #f5f3ee; text-align: center; font-family: inherit; box-shadow: 0 10px 40px rgba(0,0,0,.6); }
  .card .in { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 34px 28px 84px; }
  /* a thin inner frame, like the mat around a print */
  .slide.card::before { content: ""; position: absolute; inset: 14px; border: 1px solid rgba(255,255,255,.16); pointer-events: none; }
  .card .eyebrow { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; white-space: nowrap; font-size: 11px; font-weight: 600; letter-spacing: .24em; text-transform: uppercase; color: #8d8a84; }
  .card .eyebrow::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #2dd4a8; }
  .card .eyebrow.plain::before { background: #5c5a56; }
  .card .mid { display: flex; flex-direction: column; align-items: center; }
  .card b { display: block; font-size: 34px; font-weight: 800; line-height: 1.05; letter-spacing: -.03em; text-wrap: balance; }
  .card .rule { width: 40px; height: 4px; margin: 16px 0 14px; background: #2dd4a8; }
  .card .rule.plain { background: #f5f3ee; }
  .card .mid span { font-size: 18px; font-weight: 600; line-height: 1.3; letter-spacing: -.01em; color: #e4e2dc; text-wrap: balance; }
  .card .mid small { margin-top: 4px; font-size: 14px; font-weight: 400; line-height: 1.35; color: #8d8a84; text-wrap: balance; }
  .card .foot { position: absolute; left: 30px; right: 30px; bottom: 30px; display: flex; align-items: center; justify-content: center; gap: 8px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.14); white-space: nowrap; font-size: 14px; font-weight: 500; color: #a09d97; }
  .card .foot svg { width: 18px; height: 18px; flex-shrink: 0; }
  .light .choose.action { background: #4353ff; border-color: #4353ff; animation: none; }
  .light .choose.action i { display: none; }
  .slide.cur { z-index: 2; box-shadow: 0 10px 40px rgba(0,0,0,.6); }
  .slide.on { border-color: #2dd4a8; }
  .slide .mark { position: absolute; top: 12px; right: 12px; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.35); border: 2px solid rgba(255,255,255,.85); pointer-events: none; }
  .slide.on .mark { background: #2dd4a8; border-color: #2dd4a8; }
  .slide .mark svg { width: 20px; height: 20px; opacity: 0; } .slide.on .mark svg { opacity: 1; }
  .slide .mark { transform: scale(var(--mark, 1)); transform-origin: top right; }
  /* Motion that teaches the page: the select button breathes until it is used, and on the
     last photo the Back button calls for attention once it has been selected. */
  @keyframes ring { 0% { box-shadow: 0 0 0 0 rgba(45,212,168,.7); } 100% { box-shadow: 0 0 0 26px rgba(45,212,168,0); } }
  @keyframes breathe { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); } 50% { box-shadow: 0 0 0 8px rgba(255,255,255,.16); } }
  @keyframes pop { 0% { transform: scale(1); } 40% { transform: scale(1.06); } 100% { transform: scale(1); } }
  .light .close.call { border-color: #2dd4a8; animation: ring 1s ease-out infinite; }
  .light .choose:not(.on) { animation: breathe 1.8s ease-in-out infinite; }
  .light .choose.pop { animation: pop .35s ease-out; }
  @media (prefers-reduced-motion: reduce) { .light * { animation: none !important; } }
  .light .foot { flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 20px max(18px, env(safe-area-inset-bottom)); }
  .light .choose { display: flex; align-items: center; justify-content: center; gap: 14px; flex: 1; max-width: 560px; min-height: 76px; border: 2px solid rgba(255,255,255,.6); font-size: 16px; letter-spacing: .1em; text-transform: uppercase; }
  .light .choose i { width: 26px; height: 26px; border-radius: 50%; border: 2px solid #fff; display: flex; align-items: center; justify-content: center; }
  .light .choose i svg { opacity: 0; width: 14px; height: 14px; }
  .light .choose.on { background: #2dd4a8; border-color: #2dd4a8; color: #fff; }
  .light .choose.on i { background: #fff; } .light .choose.on i svg { opacity: 1; stroke: #2dd4a8; }
  /* While a photo is magnified: a small reminder of how to get back, and nothing else competing */
  .zoomhint { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); z-index: 30; padding: 10px 18px; border-radius: 999px; background: rgba(0,0,0,.72); color: #e8e8e8; font-size: 14px; white-space: nowrap; opacity: 0; transition: opacity .2s; pointer-events: none; }
  .light.zoomed .zoomhint { opacity: 1; }
  .light .bartop, .light .foot { position: relative; z-index: 25; background: #050505; }
  /* "Send to the same place as last time?" — shown when these faces already left contact details */
  .sheet { position: fixed; inset: 0; z-index: 20; background: rgba(0,0,0,.8); display: none; align-items: center; justify-content: center; padding: 24px; }
  .sheet.show { display: flex; }
  .card { width: 100%; max-width: 460px; background: #0e0e0e; border: 1px solid #262626; padding: 32px 28px; }
  .card .brand { font-size: 11px; letter-spacing: .2em; text-transform: uppercase; color: #444; margin-bottom: 14px; }
  .card h1 { font-size: 26px; font-weight: 300; letter-spacing: -.02em; margin-bottom: 8px; }
  .card p { font-size: 14px; font-weight: 300; color: #777; margin-bottom: 20px; }
  /* One row per person. Ticked = will receive the photos. */
  .known { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 68px; padding: 10px 16px; background: #111; border: 2px solid #222; margin-bottom: 8px; text-align: left; }
  .known.on { border-color: #2dd4a8; }
  .known i { width: 28px; height: 28px; border-radius: 50%; border: 2px solid rgba(255,255,255,.7); display: flex; align-items: center; justify-content: center; flex-shrink: 0; pointer-events: none; }
  .known.on i { background: #2dd4a8; border-color: #2dd4a8; }
  .known i svg { opacity: 0; } .known.on i svg { opacity: 1; }
  .known img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; pointer-events: none; }
  .known span { min-width: 0; pointer-events: none; }
  .known b { display: block; font-size: 16px; font-weight: 300; letter-spacing: .02em; overflow-wrap: anywhere; }
  .known small { font-size: 12px; color: #666; }
  .known:not(.on) b { color: #777; }
  .addform { border: 1px solid #222; padding: 12px 12px 4px; margin-bottom: 8px; }
  .addform .other { margin: 0 0 8px; }
  .err { color: #f06060; font-size: 13px; min-height: 0; margin: 0 0 8px !important; }
  .card .cancel { width: 100%; min-height: 48px; margin-top: 6px; color: #777; font-size: 13px; letter-spacing: .06em; }
  .card { max-height: calc(100vh - 32px); overflow-y: auto; }
  .card input { width: 100%; padding: 16px; background: #111; border: 1px solid #222; color: #f0f0f0; font: 300 17px inherit; margin-bottom: 12px; outline: none; }
  .card .send:disabled { opacity: .4; }
  .card .send { width: 100%; min-height: 64px; margin-top: 10px; padding: 18px; background: #4353ff; border: 2px solid #4353ff; color: #fff; font-size: 15px; letter-spacing: .1em; text-transform: uppercase; }
  /* Same size as the main button, but outlined: a real option that clearly isn't the chosen one */
  .card .other { width: 100%; min-height: 64px; padding: 18px; margin-top: 2px; background: transparent; border: 2px solid #3a3a3a; color: #cfcfcf; font-size: 15px; letter-spacing: .1em; text-transform: uppercase; }
</style>
</head>
<body>
  <div class="mock">
    <strong>Mockup</strong>
    <label>Guest opens: <select id="pick"></select></label>
    <span>Real Easter photos and real matches from the trial. This yellow strip is not part of the kiosk.</span>
  </div>

  <div class="top">
    <button class="back">‹ Back</button>
    <div class="label" id="label"></div>
    <div style="width:86px"></div>
  </div>

  <div class="scroll" id="scroll"></div>

  <div class="bar">
    <p id="summary"></p>
    <button class="go" id="go"></button>
  </div>

  <div class="light" id="light">
    <div class="bartop">
      <button class="close" id="close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>Back</button>
      <p class="where" id="where"></p>
    </div>
    <div class="stage" id="stage">
      <div class="zoomhint">Drag to look around · tap the photo to zoom back out</div>
    </div>
    <div class="foot">
      <button class="choose" id="choose"><i><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></i><span></span></button>
    </div>
  </div>

  <div class="sheet" id="sheet"><div class="card" id="card"></div></div>

<script>
const EXAMPLES = __DATA__;
const TICK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
const VIEW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>';
let ex, picked;
let shown = { before: false, after: false };   // neighbouring sessions the guest has asked to see

const pick = document.getElementById("pick");
EXAMPLES.forEach((e, i) => pick.add(new Option(e.label, i)));
pick.onchange = () => load(+pick.value);

function load(i) {
  ex = EXAMPLES[i];
  picked = new Set(ex.mine.map((p) => p.id)); // their own session starts fully ticked
  shown = { before: false, after: false };
  render();
  document.getElementById("scroll").scrollTop = 0;
}

function tile(p, extra, group) {
  return `<div class="tile ${picked.has(p.id) ? "on" : ""}" data-id="${p.id}" data-group="${group || "Your photos"}">
    <div class="frame">
      <img class="photo" src="${p.src}" alt="">
      <div class="tick" role="checkbox" aria-label="Select this photo">${TICK}</div>
    </div>${extra || ""}
    <button class="view" aria-label="View larger">${VIEW}<span>View</span></button>
  </div>`;
}

function render() {
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  document.getElementById("label").innerHTML = `Session ${ex.session}<b>${ex.seating} seating</b>`;
  const allMine = ex.mine.every((p) => picked.has(p.id));
  let html = `<div class="head"><h2>Your photos</h2><p>Tap a photo to leave it out · View to see it larger</p>
      <button class="all" id="all">${allMine ? "Clear" : "Select all"}</button></div>
    <div class="grid">${ex.mine.map((p) => tile(p)).join("")}</div>`;

  // Suggestions follow the photos the guest kept: untick a photo of someone else
  // and the photos found through that person's face go away too.
  const suggested = ex.suggested.filter((p) => p.via.some((id) => picked.has(id)));
  ex.suggested.filter((p) => !suggested.includes(p)).forEach((p) => picked.delete(p.id));
  html += `<div class="head want"><h2>Want these too?</h2><p>${
    suggested.length
      ? "We spotted you in " + plural(suggested.length, "photo") + " from another session. Tap a photo to add it."
      : ""}</p></div>`;
  html += suggested.length
    ? `<div class="grid">${suggested.map((p) => tile(p,
        `<div class="cap"><img src="${p.chip}" alt=""><b>${p.people > 1 ? p.people + " of you" : "You"} in this photo</b>
           <span>Session ${p.session}${p.seating !== ex.seating ? " · " + p.seating : ""}</span></div>`, "Want these too?")).join("")}</div>`
    : `<p class="none">We didn't find you in any other session.</p>`;

  // Other sessions are never offered here. Once a guest has opened one from the large view,
  // it is listed so that anything they picked from it stays visible.
  html += ["before", "after"].map((when) => {
    const list = nearby(when);
    return shown[when] && list.length
      ? `<div class="head"><h2>Session ${when}</h2><p>Session ${list[0].session} — tap any that are yours</p></div>
         <div class="grid small">${list.map((p) => tile(p, "", "Session " + when)).join("")}</div>`
      : "";
  }).join("");
  document.getElementById("scroll").innerHTML = html;

  const mine = ex.mine.filter((p) => picked.has(p.id)).length;
  const extra = picked.size - mine;
  document.getElementById("summary").innerHTML =
    `${plural(mine, "photo")} from your session` + (extra ? ` <b>+ ${extra} added</b>` : "");
  const go = document.getElementById("go");
  go.textContent = `Get my ${plural(picked.size, "photo")}`;
  go.disabled = picked.size === 0;
}

// Tapping anywhere on a photo selects it. The View button underneath opens it large,
// where it can also be selected.
let viewing = -1;
const visible = () => [...document.querySelectorAll("#scroll .tile")];

function toggle(id) {
  picked.has(id) ? picked.delete(id) : picked.add(id);
  const top = document.getElementById("scroll").scrollTop;
  render();
  document.getElementById("scroll").scrollTop = top;
}

// Restart a CSS animation on an element
function play(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function calm() { document.getElementById("close").classList.remove("call"); }

const SMALL = 0.5, GAP = 18;
let slides = [];   // one element per photo, kept while the viewer is open so they can glide
let pos = 0;       // where the carousel is, as a fractional photo number (2.5 = halfway between 2 and 3)
let vel = 0, target = 0, raf = 0, lastT = 0;
// Pinch-zoom of the photo in the middle: how much it is magnified and how far it has been moved
let zoom = { s: 1, x: 0, y: 0 };
const MAX_ZOOM = 5;

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const FACE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r=".8" fill="currentColor"/><circle cx="15" cy="10" r=".8" fill="currentColor"/><path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8"/></svg>';
const SWIPE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/></svg>';

// (Re)create the slides: every photo on the page, in order, with a card wherever a new section
// starts and one at the very end if the neighbouring sessions haven't been opened yet.
function buildSlides() {
  const stage = document.getElementById("stage");
  stage.querySelectorAll(".slide").forEach((el) => el.remove());
  const tiles = visible();
  const photo = (t) => ({ id: t.dataset.id, src: t.querySelector("img.photo").src });
  const inGroup = (g) => tiles.filter((t) => t.dataset.group === g).map(photo);
  const card = (kind, cls, eyebrow, plain, mid, foot, top = "") => ({ card: kind, cls, html:
    `<div class="in"><div class="mid">${top}<div class="eyebrow ${plain ? "plain" : ""}">${eyebrow}</div>${mid}</div><div class="foot">${foot}</div></div>` });
  const LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="20" y1="12" x2="4" y2="12"/><polyline points="10 6 4 12 10 18"/></svg>';

  // A neighbouring session: either its photos (once asked for) or a card offering to show them
  const neighbour = (when) => {
    if (!nearby(when).length) return [];
    const arrow = when === "before" ? LEFT : SWIPE;
    if (!shown[when]) {
      return [card("more-" + when, "more", when === "before" ? "Start of your photos" : "End of your photos", true,
        `<b>Missing a photo?</b><div class="rule plain"></div><span>See the session taken just ${when} yours</span>`,
        when === "before" ? `${arrow} Tap to show it` : `Tap to show it ${arrow}`)];
    }
    const photos = inGroup("Session " + when);
    const divider = card("divider", "", "Not matched by face", true,
      `<b>Session ${when}</b><div class="rule plain"></div><span>${plural(photos.length, "photo")}</span><small>shown because of when ${photos.length === 1 ? "it was" : "they were"} taken</small>`,
      when === "before" ? `${arrow} Select any that are yours` : `Select any that are yours ${arrow}`);
    return when === "before" ? [...photos, divider] : [divider, ...photos];
  };

  const items = [...neighbour("before"), ...inGroup("Your photos")];
  const found = suggested();
  if (found.length) {
    const sessions = [...new Set(found.map((p) => p.session))];
    items.push(card("divider", "spotted", "Face match", false,
      `<b>Want these too?</b><div class="rule"></div>
       <span>We spotted you in ${plural(found.length, "more photo")}</span>
       <small>from ${sessions.length === 1 ? "session " + sessions[0] : sessions.length + " other sessions"}</small>`,
      `Not you? Swipe past ${SWIPE}`));
    items.push(...inGroup("Want these too?"));
  }
  items.push(...neighbour("after"));

  slides = items.map((item, i) => {
    const el = document.createElement("button");
    el.dataset.i = i;
    if (item.card) {
      el.className = `slide card ${item.cls}`;
      el.dataset.card = item.card;
      el.innerHTML = item.html;
    } else {
      el.className = "slide";
      el.dataset.id = item.id;
      el.innerHTML = `<img src="${item.src}" alt=""><span class="mark">${TICK}</span>`;
      el.querySelector("img").onload = () => layout();
    }
    stage.appendChild(el);
    return el;
  });
}
const isMore = (i) => (slides[i]?.dataset.card || "").startsWith("more-");
const isDivider = (i) => slides[i]?.dataset.card === "divider";
const indexOfPhoto = (id) => slides.findIndex((el) => el.dataset.id === id);

function fullSizes() {
  const stage = document.getElementById("stage");
  const W = stage.clientWidth, H = stage.clientHeight - 16;
  return slides.map((el) => {
    if (el.dataset.card) return { w: H * 0.9 * 0.667, h: H * 0.9 };   // about the size of a portrait photo
    const img = el.querySelector("img");
    const ratio = (img.naturalWidth || 2) / (img.naturalHeight || 3);
    const h = Math.min(H, (W * 0.56) / ratio);
    return { w: h * ratio, h };
  });
}

// Where photo i sits when photo v is the one in the middle
function restX(full, v, i) {
  if (i === v) return 0;
  const dir = i > v ? 1 : -1;
  let x = dir * (full[v].w / 2 + GAP + (full[i].w * SMALL) / 2);
  for (let k = v + dir; k !== i; k += dir) x += dir * (full[k].w * SMALL + GAP);
  return x;
}

// How far the row must travel to bring the next photo into the middle
function stepPx() {
  const full = fullSizes(), a = Math.max(0, Math.min(slides.length - 2, Math.floor(pos)));
  return slides.length > 1 ? Math.abs(restX(full, a, a + 1)) : 300;
}

// Draw the row for the current `pos`. Between two photos everything is blended: position, size
// and colour all change together and continuously, so a photo swells smoothly as it nears the
// middle and settles back as it leaves — no sudden switch.
function layout() {
  if (!slides.length) return;
  const full = fullSizes();
  const last = slides.length - 1;
  const a = Math.max(0, Math.min(last, Math.floor(pos))), b = Math.min(last, a + 1);
  const t = Math.max(0, Math.min(1, pos - a));
  const over = pos < 0 ? pos : pos > last ? pos - last : 0;   // pulled past either end
  slides.forEach((el, i) => {
    const x = restX(full, a, i) * (1 - t) + restX(full, b, i) * t - over * stepPx() * 0.5;
    const near = Math.max(0, 1 - Math.abs(pos - i));           // 1 in the middle, 0 one photo away
    const ease = near * near * (3 - 2 * near);                  // soft start and finish
    const zoomed = i === viewing && zoom.s > 1;
    const scale = (SMALL + (1 - SMALL) * ease) * (zoomed ? zoom.s : 1);
    const aside = i === viewing ? 1 : Math.max(0.1, 1 - (zoom.s - 1) * 2);   // neighbours fade while zoomed
    el.style.width = full[i].w + "px";
    el.style.height = full[i].h + "px";
    el.style.transform = `translate(-50%, -50%) translate3d(${x + (zoomed ? zoom.x : 0)}px, ${zoomed ? zoom.y : 0}px, 0) scale(${scale})`;
    el.style.filter = `saturate(${0.5 + 0.5 * ease}) brightness(${0.75 + 0.25 * ease})`;
    el.style.opacity = (0.8 + 0.2 * ease) * aside;
    el.style.zIndex = zoomed ? 20 : Math.round(ease * 10);
    el.style.setProperty("--mark", 1.5 - 0.5 * ease);
    el.classList.toggle("cur", i === viewing);
    el.classList.toggle("on", !!el.dataset.id && picked.has(el.dataset.id));
  });
}

function updateChrome() {
  const cur = slides[viewing];
  const choose = document.getElementById("choose");
  const photos = slides.filter((el) => el.dataset.id);
  if (isMore(viewing)) {
    const when = cur.dataset.card.slice(5);
    document.getElementById("where").textContent = `${when === "before" ? "Start" : "End"} of your photos · ${plural(photos.length, "photo")}`;
    choose.classList.remove("on");
    choose.classList.add("action");
    choose.querySelector("span").textContent = `Show the session ${when}`;
    return;
  }
  const on = picked.has(cur.dataset.id);
  const group = visible().find((t) => t.dataset.id === cur.dataset.id).dataset.group;
  document.getElementById("where").textContent = `${group} · photo ${photos.indexOf(cur) + 1} of ${photos.length}`;
  choose.classList.remove("action");
  choose.classList.toggle("on", on);
  choose.querySelector("span").textContent = on ? "Selected" : "Select this photo";
}

// Follow `pos`: whichever photo is nearest the middle is the one the buttons act on
function track() {
  const nearest = Math.max(0, Math.min(slides.length - 1, Math.round(pos)));
  // a divider card is only passed over, so the buttons stay with the last photo until the next arrives
  if (nearest !== viewing && !isDivider(nearest)) { viewing = nearest; calm(); updateChrome(); }
  layout();
}

// Glide to a photo on a critically damped spring — quick to start, gentle to settle, no bounce
function glideTo(i, dir) {
  i = Math.max(0, Math.min(slides.length - 1, i));
  // never come to rest on a divider: carry on in the direction of travel
  if (isDivider(i)) i += dir || Math.sign(i - target) || 1;
  target = Math.max(0, Math.min(slides.length - 1, i));
  if (raf) return;
  lastT = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.032, (now - lastT) / 1000);
    lastT = now;
    const STIFF = 190, DAMP = 2 * Math.sqrt(STIFF);
    vel += (STIFF * (target - pos) - DAMP * vel) * dt;
    pos += vel * dt;
    if (Math.abs(target - pos) < 0.001 && Math.abs(vel) < 0.01) { pos = target; vel = 0; raf = 0; track(); return; }
    track();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
function stopGlide() { if (raf) cancelAnimationFrame(raf); raf = 0; }

function openViewer(id, at) {
  stopGlide();
  buildSlides();
  viewing = Math.max(0, indexOfPhoto(id));
  pos = target = at ?? viewing;
  vel = 0;
  document.getElementById("light").classList.add("show");
  calm();
  updateChrome();
  layout();
}
function closeViewer() {
  zoom = { s: 1, x: 0, y: 0 };
  document.getElementById("light").classList.remove("zoomed");
  document.getElementById("light").classList.remove("show");
  viewing = -1;
  stopGlide();
}
window.addEventListener("resize", () => viewing >= 0 && layout());

// Select / unselect the photo in the middle
function chooseCurrent() {
  const id = slides[viewing].dataset.id;
  const before = visible().length;
  toggle(id);
  // unticking can add or remove suggestions; rebuild the row around this same photo if so
  if (visible().length !== before) openViewer(id);
  else { updateChrome(); layout(); }
  play(document.getElementById("choose"), "pop");
  // Selected the very last item: nothing further to swipe to, so point at Back
  if (picked.has(id) && viewing === slides.length - 1) play(document.getElementById("close"), "call");
}

// Reached one end and asked for more: bring that neighbouring session into the row on that side —
// the session before joins on the left, the session after on the right
function loadMore() {
  const when = slides[viewing].dataset.card.slice(5);
  const anchor = slides.find((el) => el.dataset.id).dataset.id;   // any photo; the row is rebuilt around it
  shown[when] = true;
  render();
  openViewer(anchor);
  // stand where the card was (now the divider) and glide on to the nearest of the new photos
  const divider = when === "before"
    ? slides.findIndex((el) => el.dataset.card === "divider")
    : slides.map((el) => el.dataset.card).lastIndexOf("divider");
  pos = target = divider;
  layout();
  glideTo(divider + (when === "before" ? -1 : 1), when === "before" ? -1 : 1);
}
function mainAction() { isMore(viewing) ? loadMore() : chooseCurrent(); }

document.getElementById("scroll").onclick = (e) => {
  if (e.target.closest("#all")) {
    const all = ex.mine.every((p) => picked.has(p.id));
    ex.mine.forEach((p) => (all ? picked.delete(p.id) : picked.add(p.id)));
    render();
    return;
  }
  const t = e.target.closest(".tile");
  if (!t) return;
  if (e.target.closest(".view")) { openViewer(t.dataset.id); return; }
  toggle(t.dataset.id);
};
document.getElementById("choose").onclick = mainAction;
document.getElementById("close").onclick = closeViewer;
// ---- Looking closer -------------------------------------------------------------------------
// Pinch the middle photo to magnify it (the kiosk loads the full-size file at this point; the
// mockup just scales what it has). While magnified, one finger moves the photo around instead of
// changing photo, and a tap puts it back. The page itself never zooms.
const stage = document.getElementById("stage");

function limitZoom() {
  const full = fullSizes()[viewing];
  zoom.s = Math.max(1, Math.min(MAX_ZOOM, zoom.s));
  // the photo can be moved only as far as its own edges
  const maxX = Math.max(0, (full.w * zoom.s - stage.clientWidth) / 2);
  const maxY = Math.max(0, (full.h * zoom.s - stage.clientHeight) / 2);
  zoom.x = Math.max(-maxX, Math.min(maxX, zoom.x));
  zoom.y = Math.max(-maxY, Math.min(maxY, zoom.y));
}
function showZoom() {
  limitZoom();
  document.getElementById("light").classList.toggle("zoomed", zoom.s > 1.01);
  layout();
}
// Magnify by a factor, keeping the spot under the fingers (or cursor) where it is
function zoomAbout(factor, cx, cy) {
  const r = stage.getBoundingClientRect();
  const px = cx - (r.left + r.width / 2), py = cy - (r.top + r.height / 2);
  const s = Math.max(1, Math.min(MAX_ZOOM, zoom.s * factor)), k = s / zoom.s;
  zoom.x = px - (px - zoom.x) * k;
  zoom.y = py - (py - zoom.y) * k;
  zoom.s = s;
  showZoom();
}
let zoomRaf = 0;
function zoomOut() {
  cancelAnimationFrame(zoomRaf);
  const step = () => {
    zoom.s += (1 - zoom.s) * 0.22; zoom.x *= 0.78; zoom.y *= 0.78;
    if (zoom.s < 1.004) { zoom = { s: 1, x: 0, y: 0 }; showZoom(); return; }
    showZoom();
    zoomRaf = requestAnimationFrame(step);
  };
  zoomRaf = requestAnimationFrame(step);
}

// ---- Touch and mouse ------------------------------------------------------------------------
// One finger drags the row (it follows directly, then glides to the nearest photo, carrying the
// speed of the flick). A press without movement is a tap: on the middle photo it selects, on a
// side photo it brings that photo in. Two fingers pinch.
const fingers = new Map();
let grab = null, pinch = null;
const spread = () => { const [a, b] = [...fingers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

stage.addEventListener("pointerdown", (e) => {
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  stage.setPointerCapture(e.pointerId);
  if (fingers.size === 2 && slides[viewing]?.dataset.id) {
    // second finger down: this is a pinch, not a swipe
    stopGlide(); cancelAnimationFrame(zoomRaf);
    pos = target = viewing; vel = 0;
    grab = null;
    pinch = { last: spread() };
    return;
  }
  if (zoom.s > 1) { grab = { pan: true, x: e.clientX, y: e.clientY, zx: zoom.x, zy: zoom.y, moved: false }; return; }
  stopGlide();
  grab = { x: e.clientX, start: pos, moved: false, target: e.target.closest(".slide"), lastX: e.clientX, lastT: performance.now(), v: 0 };
});
stage.addEventListener("pointermove", (e) => {
  if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && fingers.size >= 2) {
    const now = spread();
    zoom.x += now.x - pinch.last.x; zoom.y += now.y - pinch.last.y;   // two fingers also carry the photo
    zoomAbout(now.d / pinch.last.d, now.x, now.y);
    pinch.last = now;
    return;
  }
  if (!grab) return;
  if (grab.pan) {
    const dx = e.clientX - grab.x, dy = e.clientY - grab.y;
    if (Math.hypot(dx, dy) > 8) grab.moved = true;
    zoom.x = grab.zx + dx; zoom.y = grab.zy + dy;
    showZoom();
    return;
  }
  const dx = e.clientX - grab.x;
  if (Math.abs(dx) > 8) grab.moved = true;
  if (!grab.moved) return;
  const now = performance.now(), step = stepPx();
  grab.v = (-(e.clientX - grab.lastX) / step) / Math.max(0.001, (now - grab.lastT) / 1000);   // photos per second
  grab.lastX = e.clientX; grab.lastT = now;
  pos = grab.start - dx / step;
  track();
});
const release = (e) => {
  fingers.delete(e.pointerId);
  if (pinch) {
    if (fingers.size < 2) { pinch = null; if (zoom.s < 1.1) zoomOut(); }
    return;   // the finger left behind must not turn into a swipe or a tap
  }
  if (!grab) return;
  const g = grab;
  grab = null;
  if (g.pan) { if (!g.moved) zoomOut(); return; }   // a tap while magnified puts the photo back
  if (!g.moved) {
    if (!g.target) return;
    const i = +g.target.dataset.i;
    if (i === viewing) mainAction();
    else glideTo(i);
    return;
  }
  vel = Math.max(-12, Math.min(12, g.v));
  // a flick carries on a little past where the finger left
  glideTo(Math.round(pos + vel * 0.18), Math.sign(pos - g.start) || 1);
};
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);

// Mac trackpad (two-finger swipe) and mouse wheel: the row follows the scroll, including the
// trackpad's own momentum, then settles on the nearest photo once the scrolling stops.
let wheelEnd = 0;
stage.addEventListener("wheel", (e) => {
  e.preventDefault();   // also stops the browser's swipe-to-go-back and page zoom
  // A trackpad pinch arrives as a wheel event with ctrl held
  if (e.ctrlKey) {
    if (!slides[viewing]?.dataset.id) return;
    stopGlide(); pos = target = viewing; vel = 0;
    zoomAbout(Math.exp(-e.deltaY * 0.012), e.clientX, e.clientY);
    clearTimeout(wheelEnd);
    wheelEnd = setTimeout(() => zoom.s < 1.1 && zoomOut(), 140);
    return;
  }
  if (zoom.s > 1) { zoom.x -= e.deltaX; zoom.y -= e.deltaY; showZoom(); return; }   // scroll moves a magnified photo
  const d = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  stopGlide();
  vel = 0;
  pos = Math.max(-0.35, Math.min(slides.length - 0.65, pos + d / stepPx()));
  track();
  clearTimeout(wheelEnd);
  const dir = Math.sign(d) || 1;
  wheelEnd = setTimeout(() => glideTo(Math.round(pos), dir), 90);
}, { passive: false });
document.addEventListener("keydown", (e) => {
  if (viewing < 0) return;
  if (e.key === "Escape") { zoom.s > 1 ? zoomOut() : closeViewer(); return; }
  if (zoom.s > 1) return;
  if (e.key === "ArrowLeft") glideTo(Math.round(target) - 1, -1);
  if (e.key === "ArrowRight") glideTo(Math.round(target) + 1, 1);
  if (e.key === " ") { e.preventDefault(); document.getElementById("choose").click(); }
});
// Photos of a neighbouring session that aren't already on offer as a face match
function nearby(when) {
  const matched = new Set(ex.suggested.filter((p) => p.via.some((id) => picked.has(id))).map((p) => p.id));
  return ex.near.filter((p) => p.when === when && !matched.has(p.id));
}

// Who gets these photos. Several people often want the same ones, so this is a list:
//  - anyone in the chosen photos who already left details is offered (address masked), ticked by default
//  - more people can be added before sending; each gets their own email / text
let recipients = [], adding = false;
const suggested = () => ex.suggested.filter((p) => p.via.some((id) => picked.has(id)));
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function openSheet() {
  const match = suggested()[0];
  // mockup: pretend two people from that session already left details
  recipients = match
    ? [
        { chip: match.chip, label: "j••••••@g••••.com", sub: `Entered earlier today · session ${match.session}`, on: true },
        { chip: null, label: "m•••••@y••••.com · •••-•••-4471", sub: `Entered earlier today · session ${match.session}`, on: true },
      ]
    : [];
  adding = recipients.length === 0;
  drawSheet();
  document.getElementById("sheet").classList.add("show");
}

function drawSheet() {
  const n = picked.size, photos = `${n} photo${n === 1 ? "" : "s"}`;
  const going = recipients.filter((r) => r.on).length;
  const rows = recipients.map((r, i) => `
    <button class="known ${r.on ? "on" : ""}" data-rcp="${i}">
      <i>${TICK}</i>
      ${r.chip ? `<img src="${r.chip}" alt="">` : ""}
      <span><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></span>
    </button>`).join("");
  const form = `
    <div class="addform">
      <input id="fname" placeholder="Name">
      <input id="femail" placeholder="Email" inputmode="email" autocapitalize="none">
      <input id="fphone" placeholder="Phone (optional)" inputmode="tel">
      <p class="err" id="ferr"></p>
      <button class="other" id="addsave">${recipients.length ? "Add this person" : "Continue"}</button>
    </div>`;
  document.getElementById("card").innerHTML = `
    <p class="brand">Easter 2026</p>
    <h1>${recipients.length ? "Who should get these?" : "Get your photos"}</h1>
    <p>${recipients.length
        ? `${photos}. Tap a name to leave someone out.`
        : `Enter your info and we'll send you ${photos}.`}</p>
    ${rows}
    ${adding ? form : `<button class="other" id="addopen">+ Add another person</button>`}
    ${recipients.length ? `<button class="send" id="sendall" ${going ? "" : "disabled"}>${
        going ? `Send ${photos} to ${going} ${going === 1 ? "person" : "people"}` : "Nobody selected"}</button>` : ""}
    <button class="cancel" id="cancel">Back to photos</button>`;
}

document.getElementById("go").onclick = openSheet;
document.getElementById("sheet").onclick = (e) => {
  const close = () => document.getElementById("sheet").classList.remove("show");
  const row = e.target.closest("[data-rcp]");
  if (row) { const r = recipients[+row.dataset.rcp]; r.on = !r.on; return drawSheet(); }
  if (e.target.id === "addopen") { adding = true; return drawSheet(); }
  if (e.target.id === "addsave") {
    const name = document.getElementById("fname").value.trim();
    const email = document.getElementById("femail").value.trim();
    const phone = document.getElementById("fphone").value.trim();
    if (!name || (!email && !phone)) {
      document.getElementById("ferr").textContent = "Please enter a name and an email or phone";
      return;
    }
    // just typed by the person standing here, so it is shown in full
    recipients.push({ chip: null, label: [email, phone].filter(Boolean).join(" · "), sub: name, on: true });
    adding = false;
    return drawSheet();
  }
  if (e.target.id === "sendall" || e.target.id === "cancel" || e.target.id === "sheet") close();
};
load(0);
</script>
</body>
</html>'''
open("index.html", "w").write(html.replace("__DATA__", data))
