// The large view: a carousel where the photo being looked at is big in the middle and its
// neighbours sit smaller on either side. Swipe to move along, tap a side photo to bring it in,
// tap the middle photo (or the button) to select it, pinch to magnify. Cards travel in the row
// like photos: a divider says why the next photos are there, and a "more" card at either end
// offers the neighbouring session.
//
// Ported from the approved mockup (prototype/want-these-too/mockup). Plain DOM on purpose: the
// motion is driven per frame and must not go through React renders.

export type SlideItem =
  | { id: string; src: string; full?: string | null; group: string }
  | { card: "more-before" | "more-after" | "divider"; cls: string; html: string };

export interface CarouselHooks {
  onToggle: (id: string) => void; // select / unselect the photo in the middle
  onLoadMore: (when: "before" | "after") => void; // guest asked for a neighbouring session
  onClose: () => void;
  groupLabel: (id: string) => string;
}

const TICK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
const SMALL = 0.5;
const GAP = 18;
const MAX_ZOOM = 5;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export class Carousel {
  private slides: HTMLButtonElement[] = [];
  private items: SlideItem[] = [];
  private picked = new Set<string>();
  private viewing = -1;
  private pos = 0;
  private vel = 0;
  private target = 0;
  private raf = 0;
  private lastT = 0;
  private zoom = { s: 1, x: 0, y: 0 };
  private zoomRaf = 0;
  private fingers = new Map<number, { x: number; y: number }>();
  private grab: any = null;
  private pinch: any = null;
  private wheelEnd = 0;
  private fullLoaded = new Set<number>();
  private open = false;
  private cleanup: (() => void)[] = [];

  constructor(
    private root: HTMLElement, // .light
    private stage: HTMLElement,
    private where: HTMLElement,
    private choose: HTMLButtonElement,
    private close: HTMLButtonElement,
    private hooks: CarouselHooks
  ) {
    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement | Document | Window,
      type: K | string,
      fn: any,
      opts?: any
    ) => {
      el.addEventListener(type as any, fn, opts);
      this.cleanup.push(() => el.removeEventListener(type as any, fn, opts));
    };
    on(stage, "pointerdown", (e: PointerEvent) => this.onDown(e));
    on(stage, "pointermove", (e: PointerEvent) => this.onMove(e));
    on(stage, "pointerup", (e: PointerEvent) => this.onRelease(e));
    on(stage, "pointercancel", (e: PointerEvent) => this.onRelease(e));
    on(stage, "wheel", (e: WheelEvent) => this.onWheel(e), { passive: false });
    on(document, "keydown", (e: KeyboardEvent) => this.onKey(e));
    on(window, "resize", () => this.open && this.layout());
    on(choose, "click", () => this.mainAction());
    on(close, "click", () => this.hooks.onClose());
  }

  destroy() {
    this.stopGlide();
    cancelAnimationFrame(this.zoomRaf);
    this.cleanup.forEach((f) => f());
    this.cleanup = [];
  }

  // ---- public ----------------------------------------------------------------------------

  show(items: SlideItem[], picked: Set<string>, startId: string, at?: number) {
    this.stopGlide();
    this.items = items;
    this.picked = picked;
    this.buildSlides();
    this.viewing = Math.max(0, this.indexOfPhoto(startId));
    this.pos = this.target = at ?? this.viewing;
    this.vel = 0;
    this.open = true;
    this.root.classList.add("show");
    this.calm();
    this.updateChrome();
    this.layout();
  }

  hide() {
    this.zoom = { s: 1, x: 0, y: 0 };
    this.root.classList.remove("zoomed");
    this.root.classList.remove("show");
    this.open = false;
    this.viewing = -1;
    this.stopGlide();
  }

  isOpen() {
    return this.open;
  }

  setPicked(picked: Set<string>) {
    this.picked = picked;
    if (!this.open) return;
    this.updateChrome();
    this.layout();
  }

  // After a neighbouring session was added: rebuild around the same photo, stand on the new
  // divider and glide on to the nearest of the new photos
  rebuildAfterMore(items: SlideItem[], picked: Set<string>, when: "before" | "after") {
    const anchor = this.slides.find((el) => el.dataset.id)?.dataset.id ?? "";
    this.show(items, picked, anchor);
    const cards = this.slides.map((el) => el.dataset.card || "");
    const divider = when === "before" ? cards.indexOf("divider") : cards.lastIndexOf("divider");
    if (divider < 0) return;
    this.pos = this.target = divider;
    this.layout();
    this.glideTo(divider + (when === "before" ? -1 : 1), when === "before" ? -1 : 1);
  }

  currentId(): string | null {
    return this.slides[this.viewing]?.dataset.id ?? null;
  }

  // ---- slides -----------------------------------------------------------------------------

  private buildSlides() {
    this.stage.querySelectorAll(".slide").forEach((el) => el.remove());
    this.fullLoaded.clear();
    this.slides = this.items.map((item, i) => {
      const el = document.createElement("button");
      el.dataset.i = String(i);
      if ("card" in item) {
        el.className = `slide card ${item.cls}`;
        el.dataset.card = item.card;
        el.innerHTML = item.html;
      } else {
        el.className = "slide";
        el.dataset.id = item.id;
        el.innerHTML = `<img src="${item.src}" alt=""><span class="mark">${TICK}</span>`;
        el.querySelector("img")!.onload = () => this.layout();
      }
      this.stage.appendChild(el);
      return el;
    });
  }

  private isMore(i: number) {
    return (this.slides[i]?.dataset.card || "").startsWith("more-");
  }
  private isDivider(i: number) {
    return this.slides[i]?.dataset.card === "divider";
  }
  private indexOfPhoto(id: string) {
    return this.slides.findIndex((el) => el.dataset.id === id);
  }

  private fullSizes() {
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight - 16;
    return this.slides.map((el) => {
      if (el.dataset.card) return { w: H * 0.9 * 0.667, h: H * 0.9 };
      const img = el.querySelector("img")!;
      const ratio = (img.naturalWidth || 2) / (img.naturalHeight || 3);
      const h = Math.min(H, (W * 0.56) / ratio);
      return { w: h * ratio, h };
    });
  }

  private restX(full: { w: number; h: number }[], v: number, i: number) {
    if (i === v) return 0;
    const dir = i > v ? 1 : -1;
    let x = dir * (full[v].w / 2 + GAP + (full[i].w * SMALL) / 2);
    for (let k = v + dir; k !== i; k += dir) x += dir * (full[k].w * SMALL + GAP);
    return x;
  }

  private stepPx() {
    const full = this.fullSizes();
    const a = Math.max(0, Math.min(this.slides.length - 2, Math.floor(this.pos)));
    return this.slides.length > 1 ? Math.abs(this.restX(full, a, a + 1)) : 300;
  }

  private layout() {
    if (!this.slides.length) return;
    const full = this.fullSizes();
    const last = this.slides.length - 1;
    const a = Math.max(0, Math.min(last, Math.floor(this.pos)));
    const b = Math.min(last, a + 1);
    const t = Math.max(0, Math.min(1, this.pos - a));
    const over = this.pos < 0 ? this.pos : this.pos > last ? this.pos - last : 0;
    const step = this.stepPx();
    this.slides.forEach((el, i) => {
      const x = this.restX(full, a, i) * (1 - t) + this.restX(full, b, i) * t - over * step * 0.5;
      const near = Math.max(0, 1 - Math.abs(this.pos - i));
      const ease = near * near * (3 - 2 * near);
      const zoomed = i === this.viewing && this.zoom.s > 1;
      const scale = (SMALL + (1 - SMALL) * ease) * (zoomed ? this.zoom.s : 1);
      const aside = i === this.viewing ? 1 : Math.max(0.1, 1 - (this.zoom.s - 1) * 2);
      el.style.width = full[i].w + "px";
      el.style.height = full[i].h + "px";
      el.style.transform = `translate(-50%, -50%) translate3d(${x + (zoomed ? this.zoom.x : 0)}px, ${zoomed ? this.zoom.y : 0}px, 0) scale(${scale})`;
      el.style.filter = `saturate(${0.5 + 0.5 * ease}) brightness(${0.75 + 0.25 * ease})`;
      el.style.opacity = String((0.8 + 0.2 * ease) * aside);
      el.style.zIndex = String(zoomed ? 20 : Math.round(ease * 10));
      el.style.setProperty("--mark", String(1.5 - 0.5 * ease));
      el.classList.toggle("cur", i === this.viewing);
      el.classList.toggle("on", !!el.dataset.id && this.picked.has(el.dataset.id));
    });
  }

  // The middle photo gets the full-size file once, so pinching shows real detail
  private loadFull(i: number) {
    if (this.fullLoaded.has(i)) return;
    const item = this.items[i];
    if (!item || "card" in item || !item.full) return;
    this.fullLoaded.add(i);
    const img = this.slides[i].querySelector("img")!;
    const pre = new Image();
    pre.onload = () => {
      if (this.slides[i]?.isConnected) img.src = item.full!;
    };
    pre.src = item.full;
  }

  private updateChrome() {
    const cur = this.slides[this.viewing];
    if (!cur) return;
    const photos = this.slides.filter((el) => el.dataset.id);
    const span = this.choose.querySelector("span")!;
    if (this.isMore(this.viewing)) {
      const when = cur.dataset.card!.slice(5);
      this.where.textContent = `${when === "before" ? "Start" : "End"} of your photos · ${plural(photos.length, "photo")}`;
      this.choose.classList.remove("on");
      this.choose.classList.add("action");
      span.textContent = `Show the session ${when}`;
      return;
    }
    const id = cur.dataset.id!;
    const on = this.picked.has(id);
    this.where.textContent = `${this.hooks.groupLabel(id)} · photo ${photos.indexOf(cur) + 1} of ${photos.length}`;
    this.choose.classList.remove("action");
    this.choose.classList.toggle("on", on);
    span.textContent = on ? "Selected" : "Select this photo";
    this.loadFull(this.viewing);
  }

  private track() {
    const nearest = Math.max(0, Math.min(this.slides.length - 1, Math.round(this.pos)));
    if (nearest !== this.viewing && !this.isDivider(nearest)) {
      this.viewing = nearest;
      this.calm();
      this.updateChrome();
    }
    this.layout();
  }

  private glideTo(i: number, dir?: number) {
    i = Math.max(0, Math.min(this.slides.length - 1, i));
    if (this.isDivider(i)) i += dir || Math.sign(i - this.target) || 1;
    this.target = Math.max(0, Math.min(this.slides.length - 1, i));
    if (this.raf) return;
    this.lastT = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - this.lastT) / 1000);
      this.lastT = now;
      const STIFF = 190;
      const DAMP = 2 * Math.sqrt(STIFF);
      this.vel += (STIFF * (this.target - this.pos) - DAMP * this.vel) * dt;
      this.pos += this.vel * dt;
      if (Math.abs(this.target - this.pos) < 0.001 && Math.abs(this.vel) < 0.01) {
        this.pos = this.target;
        this.vel = 0;
        this.raf = 0;
        this.track();
        return;
      }
      this.track();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopGlide() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private play(el: HTMLElement, cls: string) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  private calm() {
    this.close.classList.remove("call");
  }

  private chooseCurrent() {
    const id = this.slides[this.viewing]?.dataset.id;
    if (!id) return;
    this.hooks.onToggle(id); // the owner calls setPicked() back with the new state
    this.play(this.choose, "pop");
    // Selected the very last item: nothing further to swipe to, so point at Back
    if (!this.picked.has(id) && this.viewing === this.slides.length - 1) this.play(this.close, "call");
  }

  private mainAction() {
    if (this.isMore(this.viewing)) {
      this.hooks.onLoadMore(this.slides[this.viewing].dataset.card!.slice(5) as "before" | "after");
    } else {
      this.chooseCurrent();
    }
  }

  // ---- zoom -----------------------------------------------------------------------------

  private limitZoom() {
    const full = this.fullSizes()[this.viewing];
    if (!full) return;
    this.zoom.s = Math.max(1, Math.min(MAX_ZOOM, this.zoom.s));
    const maxX = Math.max(0, (full.w * this.zoom.s - this.stage.clientWidth) / 2);
    const maxY = Math.max(0, (full.h * this.zoom.s - this.stage.clientHeight) / 2);
    this.zoom.x = Math.max(-maxX, Math.min(maxX, this.zoom.x));
    this.zoom.y = Math.max(-maxY, Math.min(maxY, this.zoom.y));
  }
  private showZoom() {
    this.limitZoom();
    this.root.classList.toggle("zoomed", this.zoom.s > 1.01);
    this.layout();
  }
  private zoomAbout(factor: number, cx: number, cy: number) {
    const r = this.stage.getBoundingClientRect();
    const px = cx - (r.left + r.width / 2);
    const py = cy - (r.top + r.height / 2);
    const s = Math.max(1, Math.min(MAX_ZOOM, this.zoom.s * factor));
    const k = s / this.zoom.s;
    this.zoom.x = px - (px - this.zoom.x) * k;
    this.zoom.y = py - (py - this.zoom.y) * k;
    this.zoom.s = s;
    this.showZoom();
  }
  private zoomOut() {
    cancelAnimationFrame(this.zoomRaf);
    const step = () => {
      this.zoom.s += (1 - this.zoom.s) * 0.22;
      this.zoom.x *= 0.78;
      this.zoom.y *= 0.78;
      if (this.zoom.s < 1.004) {
        this.zoom = { s: 1, x: 0, y: 0 };
        this.showZoom();
        return;
      }
      this.showZoom();
      this.zoomRaf = requestAnimationFrame(step);
    };
    this.zoomRaf = requestAnimationFrame(step);
  }

  // ---- touch and mouse --------------------------------------------------------------------

  private spread() {
    const [a, b] = [...this.fingers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private onDown(e: PointerEvent) {
    if (!this.open) return;
    this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.stage.setPointerCapture(e.pointerId);
    } catch {}
    if (this.fingers.size === 2 && this.slides[this.viewing]?.dataset.id) {
      this.stopGlide();
      cancelAnimationFrame(this.zoomRaf);
      this.pos = this.target = this.viewing;
      this.vel = 0;
      this.grab = null;
      this.pinch = { last: this.spread() };
      return;
    }
    if (this.zoom.s > 1) {
      this.grab = { pan: true, x: e.clientX, y: e.clientY, zx: this.zoom.x, zy: this.zoom.y, moved: false };
      return;
    }
    this.stopGlide();
    this.grab = {
      x: e.clientX,
      start: this.pos,
      moved: false,
      target: (e.target as HTMLElement).closest(".slide") as HTMLElement | null,
      lastX: e.clientX,
      lastT: performance.now(),
      v: 0,
    };
  }

  private onMove(e: PointerEvent) {
    if (!this.open) return;
    if (this.fingers.has(e.pointerId)) this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.fingers.size >= 2) {
      const now = this.spread();
      this.zoom.x += now.x - this.pinch.last.x;
      this.zoom.y += now.y - this.pinch.last.y;
      this.zoomAbout(now.d / this.pinch.last.d, now.x, now.y);
      this.pinch.last = now;
      return;
    }
    const g = this.grab;
    if (!g) return;
    if (g.pan) {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (Math.hypot(dx, dy) > 8) g.moved = true;
      this.zoom.x = g.zx + dx;
      this.zoom.y = g.zy + dy;
      this.showZoom();
      return;
    }
    const dx = e.clientX - g.x;
    if (Math.abs(dx) > 8) g.moved = true;
    if (!g.moved) return;
    const now = performance.now();
    const step = this.stepPx();
    g.v = -(e.clientX - g.lastX) / step / Math.max(0.001, (now - g.lastT) / 1000);
    g.lastX = e.clientX;
    g.lastT = now;
    this.pos = g.start - dx / step;
    this.track();
  }

  private onRelease(e: PointerEvent) {
    this.fingers.delete(e.pointerId);
    if (this.pinch) {
      if (this.fingers.size < 2) {
        this.pinch = null;
        if (this.zoom.s < 1.1) this.zoomOut();
      }
      return;
    }
    const g = this.grab;
    if (!g) return;
    this.grab = null;
    if (g.pan) {
      if (!g.moved) this.zoomOut();
      return;
    }
    if (!g.moved) {
      if (!g.target) return;
      const i = +g.target.dataset.i;
      if (i === this.viewing) this.mainAction();
      else this.glideTo(i);
      return;
    }
    this.vel = Math.max(-12, Math.min(12, g.v));
    this.glideTo(Math.round(this.pos + this.vel * 0.18), Math.sign(this.pos - g.start) || 1);
  }

  private onWheel(e: WheelEvent) {
    if (!this.open) return;
    e.preventDefault();
    if (e.ctrlKey) {
      if (!this.slides[this.viewing]?.dataset.id) return;
      this.stopGlide();
      this.pos = this.target = this.viewing;
      this.vel = 0;
      this.zoomAbout(Math.exp(-e.deltaY * 0.012), e.clientX, e.clientY);
      clearTimeout(this.wheelEnd);
      this.wheelEnd = window.setTimeout(() => this.zoom.s < 1.1 && this.zoomOut(), 140);
      return;
    }
    if (this.zoom.s > 1) {
      this.zoom.x -= e.deltaX;
      this.zoom.y -= e.deltaY;
      this.showZoom();
      return;
    }
    const d = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    this.stopGlide();
    this.vel = 0;
    this.pos = Math.max(-0.35, Math.min(this.slides.length - 0.65, this.pos + d / this.stepPx()));
    this.track();
    clearTimeout(this.wheelEnd);
    const dir = Math.sign(d) || 1;
    this.wheelEnd = window.setTimeout(() => this.glideTo(Math.round(this.pos), dir), 90);
  }

  private onKey(e: KeyboardEvent) {
    if (!this.open) return;
    if (e.key === "Escape") {
      this.zoom.s > 1 ? this.zoomOut() : this.hooks.onClose();
      return;
    }
    if (this.zoom.s > 1) return;
    if (e.key === "ArrowLeft") this.glideTo(Math.round(this.target) - 1, -1);
    if (e.key === "ArrowRight") this.glideTo(Math.round(this.target) + 1, 1);
    if (e.key === " ") {
      e.preventDefault();
      this.mainAction();
    }
  }
}

// Cards that travel in the row
const LEFT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="20" y1="12" x2="4" y2="12"/><polyline points="10 6 4 12 10 18"/></svg>';
const SWIPE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/></svg>';

function card(kind: "more-before" | "more-after" | "divider", cls: string, eyebrow: string, plain: boolean, mid: string, foot: string): SlideItem {
  return {
    card: kind,
    cls,
    html: `<div class="in"><div class="mid"><div class="eyebrow ${plain ? "plain" : ""}">${eyebrow}</div>${mid}</div><div class="foot">${foot}</div></div>`,
  };
}

export function moreCard(when: "before" | "after"): SlideItem {
  const arrow = when === "before" ? LEFT : SWIPE;
  return card(
    `more-${when}`,
    "more",
    when === "before" ? "Start of your photos" : "End of your photos",
    true,
    `<b>Missing a photo?</b><div class="rule plain"></div><span>See the session taken just ${when} yours</span>`,
    when === "before" ? `${arrow} Tap to show it` : `Tap to show it ${arrow}`
  );
}

export function neighbourDivider(when: "before" | "after", count: number, sessionNumber: number): SlideItem {
  const arrow = when === "before" ? LEFT : SWIPE;
  return card(
    "divider",
    "",
    "Not matched by face",
    true,
    `<b>Session ${sessionNumber}</b><div class="rule plain"></div><span>${plural(count, "photo")}</span><small>shown because of when ${count === 1 ? "it was" : "they were"} taken</small>`,
    when === "before" ? `${arrow} Select any that are yours` : `Select any that are yours ${arrow}`
  );
}

export function spottedDivider(count: number, sessions: number[]): SlideItem {
  return card(
    "divider",
    "spotted",
    "Face match",
    false,
    `<b>Want these too?</b><div class="rule"></div><span>We spotted you in ${plural(count, "more photo")}</span><small>from ${sessions.length === 1 ? "session " + sessions[0] : sessions.length + " other sessions"}</small>`,
    `Not you? Swipe past ${SWIPE}`
  );
}
