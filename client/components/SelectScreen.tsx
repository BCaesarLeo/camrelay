import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../hooks/useStore";
import { Carousel, moreCard, neighbourDivider, spottedDivider, type SlideItem } from "../lib/carousel";
import type { Photo } from "../../shared/types";

// The selection screen from the approved mockup: one grid of whole photos (tap to leave one
// out, View to see it large), the AI card offer, "Want these too?" face matches, and the
// neighbouring sessions on request. The large view is the swipe carousel in lib/carousel.ts.

const TICK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const VIEW = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function SelectScreen() {
  const session = useStore((s) => s.session);
  const photos = useStore((s) => s.photos);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const setScreen = useStore((s) => s.setScreen);
  const backToSessions = useStore((s) => s.backToSessions);
  const loadPhotos = useStore((s) => s.loadPhotos);
  const loadSessions = useStore((s) => s.loadSessions);
  const openRegroup = useStore((s) => s.openRegroup);
  const eventName = useStore((s) => s.eventName);
  const sessions = useStore((s) => s.sessions);
  const deliveryMode = useStore((s) => s.deliveryMode);
  // Photos from other sessions can only go out by email/text, so offer them in online mode only
  const suggestionsEnabled = useStore((s) => s.suggestionsEnabled) && deliveryMode === "online";
  const suggestions = useStore((s) => s.suggestions);
  const extras = useStore((s) => s.extras);
  const loadSuggestions = useStore((s) => s.loadSuggestions);
  const toggleExtra = useStore((s) => s.toggleExtra);
  const neighbours = useStore((s) => s.neighbours);
  const loadNeighbour = useStore((s) => s.loadNeighbour);
  const aiCardsAvailable = useStore((s) => s.aiCardsAvailable);
  const aiCardChoices = useStore((s) => s.aiCardChoices);
  const requestCard = useStore((s) => s.requestCard);
  const [pickingCard, setPickingCard] = useState(false);
  const cardError = useStore((s) => s.cardError);

  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    loadPhotos();
    if (!sessions.length) loadSessions();
  }, [session?.id]);

  useEffect(() => {
    if (!suggestionsEnabled) return;
    loadSuggestions();
    const t = setTimeout(loadSuggestions, 6000);
    return () => clearTimeout(t);
  }, [suggestionsEnabled, session?.id]);

  const ready = photos.filter((p) => p.status === "ready");
  const own = ready.filter((p) => p.kind !== "card");
  const readyCards = ready.filter((p) => p.kind === "card");
  const drawingCard = photos.find((p) => p.kind === "card" && p.status === "processing");
  const failedCard = photos.find((p) => p.kind === "card" && p.status === "error");

  // Neighbouring sessions by number, within this event
  const neighbourSession = (when: "before" | "after") => {
    if (!session) return null;
    const n = session.sessionNumber + (when === "before" ? -1 : 1);
    return sessions.find((s) => s.sessionNumber === n && s.eventId === session.eventId) ?? null;
  };
  const suggestedIds = useMemo(() => new Set(suggestions.map((p) => p.id)), [suggestions]);
  const neighbourPhotos = (when: "before" | "after") =>
    (neighbours[when]?.photos ?? []).filter((p) => !suggestedIds.has(p.id));

  // Everything ticked: own selected photos plus anything added from other sessions
  const picked = useMemo(() => {
    const s = new Set<string>(ready.filter((p) => p.selected).map((p) => p.id));
    for (const id of extras) s.add(id);
    return s;
  }, [photos, extras]);

  const isOwn = (id: string) => photos.some((p) => p.id === id);
  const toggle = (id: string) => (isOwn(id) ? toggleSelect(id) : toggleExtra(id));
  const groupLabel = (id: string) => {
    if (isOwn(id)) return "Your photos";
    if (suggestedIds.has(id)) return "Want these too?";
    if (neighbours.before?.photos.some((p) => p.id === id)) return "Session before";
    return "Session after";
  };

  // ---- the large view -----------------------------------------------------------------------
  const lightRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const whereRef = useRef<HTMLParagraphElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const carousel = useRef<Carousel | null>(null);
  // the hooks read live state through this ref, so the carousel is built once
  const live = useRef({ toggle, groupLabel, buildItems: () => [] as SlideItem[], picked, loadNeighbour });
  live.current = { toggle, groupLabel, buildItems: () => buildItems(), picked, loadNeighbour };

  const slide = (p: Photo, group: string): SlideItem => ({
    id: p.id,
    src: p.thumbnailUrl!,
    full: p.fullUrl,
    group,
  });

  function buildItems(): SlideItem[] {
    const neighbour = (when: "before" | "after"): SlideItem[] => {
      if (deliveryMode !== "online") return [];
      const s = neighbourSession(when);
      if (!s) return [];
      if (!neighbours[when]) return [moreCard(when)];
      const list = neighbourPhotos(when);
      if (!list.length) return [];
      const divider = neighbourDivider(when, list.length, s.sessionNumber);
      const slides = list.map((p) => slide(p, `Session ${when}`));
      return when === "before" ? [...slides, divider] : [divider, ...slides];
    };
    const items: SlideItem[] = [...neighbour("before"), ...own.map((p) => slide(p, "Your photos")), ...readyCards.map((p) => slide(p, "Your photos"))];
    if (suggestions.length) {
      items.push(spottedDivider(suggestions.length, [...new Set(suggestions.map((p) => p.sessionNumber))]));
      items.push(...suggestions.map((p) => slide(p, "Want these too?")));
    }
    items.push(...neighbour("after"));
    return items;
  }

  useEffect(() => {
    if (!lightRef.current || !stageRef.current || !whereRef.current || !chooseRef.current || !closeRef.current) return;
    const c = new Carousel(lightRef.current, stageRef.current, whereRef.current, chooseRef.current, closeRef.current, {
      onToggle: (id) => live.current.toggle(id),
      onLoadMore: async (when) => {
        await live.current.loadNeighbour(when);
        // state has moved on; rebuild from the latest items on the next tick
        setTimeout(() => c.rebuildAfterMore(live.current.buildItems(), live.current.picked, when), 0);
      },
      onClose: () => c.hide(),
      groupLabel: (id) => live.current.groupLabel(id),
    });
    carousel.current = c;
    return () => {
      c.destroy();
      carousel.current = null;
    };
  }, []);

  useEffect(() => {
    carousel.current?.setPicked(picked);
  }, [picked]);

  const openViewer = (id: string) => {
    // a match the guest hasn't revealed yet is revealed by looking at it
    if (suggestedIds.has(id)) setShowSuggestions(true);
    carousel.current?.show(buildItems(), picked, id);
  };

  // ---- grid tiles -----------------------------------------------------------------------------
  const tile = (p: Photo, cap?: React.ReactNode) => (
    <div key={p.id} className={`tile ${picked.has(p.id) ? "on" : ""}`} onClick={() => toggle(p.id)}>
      <div className="frame">
        <img className="photo" src={p.thumbnailUrl!} alt="" draggable={false} />
        {p.kind === "card" && <div className="spark">✦ Halloween card</div>}
        <div className="tick">{TICK}</div>
      </div>
      {cap}
      <button
        className="view"
        onClick={(e) => {
          e.stopPropagation();
          openViewer(p.id);
        }}
      >
        {VIEW}
        <span>View</span>
      </button>
    </div>
  );

  // First tap opens the picker; picking a style is the yes (that is what sends the photo off)
  const pickCard = (choice: string) => {
    if (!own.length) return;
    setPickingCard(false);
    requestCard(own[0].id, choice);
  };
  const picking = pickingCard && !drawingCard && own.length > 0;
  const cardOffer = aiCardsAvailable && !readyCards.length && (
    <div
      className={"offer" + (picking ? " picking" : "")}
      style={{ position: "relative", cursor: drawingCard || !own.length || picking ? "default" : "pointer" }}
      onClick={() => !drawingCard && own.length && !picking && setPickingCard(true)}
    >
      <img src="/ai-cards/example.jpg" alt="" draggable={false} style={{ opacity: drawingCard ? 0.35 : 1 }} />
      {drawingCard && (
        <div className="spin">
          <i />
        </div>
      )}
      {picking ? (
        <div className="choices">
          <b>Pick a style and we'll draw it</b>
          {aiCardChoices.map((c) => (
            <button key={c.id} onClick={() => pickCard(c.id)}>
              <span>{c.emoji}</span> {c.label}
            </button>
          ))}
          <button className="no" onClick={() => setPickingCard(false)}>
            Not now
          </button>
          <small>Picking one sends your first photo to Google's AI service to draw the card.</small>
        </div>
      ) : (
        <p>
          <b>{drawingCard ? "Drawing your card…" : "✦ Tap to make our Halloween card"}</b>
          {drawingCard
            ? "About 20 seconds. It will appear here and be sent with your photos."
            : failedCard || cardError
              ? "It didn't work last time — tap to try again."
              : "A fun illustrated card made from your first photo. You pick the style next."}
        </p>
      )}
    </div>
  );

  const ownPicked = own.filter((p) => picked.has(p.id)).length + readyCards.filter((p) => picked.has(p.id)).length;
  const added = picked.size - ownPicked;
  const allOwn = own.every((p) => picked.has(p.id));
  const total = picked.size + (drawingCard ? 1 : 0);

  const neighbourSection = (when: "before" | "after") => {
    if (deliveryMode !== "online") return null;
    const s = neighbourSession(when);
    if (!s) return null;
    const list = neighbourPhotos(when);
    if (!neighbours[when]) {
      return (
        <button key={when} className="more" onClick={() => loadNeighbour(when)}>
          Missing a photo? See the session taken just {when} yours (session {s.sessionNumber})
        </button>
      );
    }
    return (
      <div key={when}>
        <div className="head">
          <h2>Session {when}</h2>
          <p>Session {s.sessionNumber} — tap any that are yours{list.length ? "" : " · nothing there yet"}</p>
        </div>
        {list.length > 0 && <div className="grid small">{list.map((p) => tile(p))}</div>}
      </div>
    );
  };

  return (
    <div className="sel">
      <div className="top">
        <button className="back" onClick={backToSessions}>
          ‹ Back
        </button>
        <div className="label">
          Session {session?.sessionNumber}
          <b>{eventName}</b>
        </div>
        <button className="back" style={{ padding: "10px 18px" }} onClick={() => openRegroup()}>
          Not us?
        </button>
      </div>

      <div className="scroll">
        <div className="head">
          <h2>Your photos</h2>
          <p>Tap a photo to leave it out · View to see it larger</p>
          {own.length > 0 && (
            <button className="all" onClick={() => own.forEach((p) => (allOwn ? p.selected : !p.selected) && toggleSelect(p.id))}>
              {allOwn ? "Clear" : "Select all"}
            </button>
          )}
        </div>
        {ready.length === 0 ? (
          <p className="empty">Waiting for photos…</p>
        ) : (
          <div className="grid">
            {cardOffer}
            {own.map((p) => tile(p))}
            {readyCards.map((p) => tile(p))}
          </div>
        )}

        {suggestionsEnabled && suggestions.length > 0 && (
          <>
            <div className="head want">
              <h2>Want these too?</h2>
              <p>
                {showSuggestions
                  ? "Tap a photo to add it. Not you? Just leave it."
                  : `We think we spotted you in ${plural(suggestions.length, "photo")} from other sessions.`}
              </p>
              {!showSuggestions && (
                <button className="all" onClick={() => setShowSuggestions(true)}>
                  Take a look
                </button>
              )}
            </div>
            {showSuggestions && (
              <div className="grid">
                {suggestions.map((p) =>
                  tile(
                    p,
                    <div className="cap">
                      <b>{p.people > 1 ? `${p.people} of you` : "You"} in this photo</b>
                      <span>Session {p.sessionNumber}</span>
                    </div>
                  )
                )}
              </div>
            )}
          </>
        )}

        {neighbourSection("before")}
        {neighbourSection("after")}
      </div>

      <div className="bar">
        <p>
          {plural(ownPicked, "photo")} from your session
          {drawingCard ? <b> + your card</b> : null}
          {added ? <b> + {added} added</b> : null}
        </p>
        <button className="go" disabled={total === 0} onClick={() => setScreen("contact")}>
          Get my {plural(total, "photo")}
        </button>
      </div>

      {/* Large view */}
      <div className="light" ref={lightRef}>
        <div className="bartop">
          <button className="close" ref={closeRef}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <p className="where" ref={whereRef}></p>
        </div>
        <div className="stage" ref={stageRef}>
          <div className="zoomhint">Drag to look around · tap the photo to zoom back out</div>
        </div>
        <div className="foot">
          <button className="choose" ref={chooseRef}>
            <i>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </i>
            <span></span>
          </button>
          {/* Finish from here: no need to go back to the grid first */}
          <button
            className="go"
            disabled={total === 0}
            onClick={() => {
              carousel.current?.hide();
              setScreen("contact");
            }}
          >
            Get my {plural(total, "photo")}
          </button>
        </div>
      </div>
    </div>
  );
}
