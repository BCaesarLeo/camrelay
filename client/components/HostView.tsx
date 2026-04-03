import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../hooks/useStore";
import type { Event } from "../../shared/types";

interface CaptureStatus {
  mode: "direct" | "watch";
  active: boolean;
  cameraDetected: boolean;
  cameraName: string | null;
  error: string | null;
  watchFolder: string | null;
}

export function HostView() {
  const sessions = useStore((s) => s.sessions);
  const loadSessions = useStore((s) => s.loadSessions);
  const createSession = useStore((s) => s.createSession);
  const loadConfig = useStore((s) => s.loadConfig);

  const [events, setEvents] = useState<Event[]>([]);
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventName, setNewEventName] = useState("");
  const [capture, setCapture] = useState<CaptureStatus | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    loadConfig();
    loadSessions();
    refreshAll();
    const interval = setInterval(refreshAll, 3000);
    return () => clearInterval(interval);
  }, []);

  const refreshAll = async () => {
    try {
      const [evts, activeEvt, cap] = await Promise.all([
        fetch("/api/events").then((r) => r.json()),
        fetch("/api/events/active").then((r) => r.ok ? r.json() : null),
        fetch("/api/capture/status").then((r) => r.json()),
      ]);
      setEvents(evts);
      setActiveEvent(activeEvt);
      setCapture(cap);
      loadSessions();
    } catch {}
  };

  const handleCreateEvent = async () => {
    if (!newEventName.trim()) return;
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newEventName.trim() }),
    });
    setNewEventName("");
    setShowNewEvent(false);
    await refreshAll();
    loadConfig();
  };

  const handleSwitchEvent = async (eventId: string) => {
    await fetch(`/api/events/${eventId}/activate`, { method: "POST" });
    await refreshAll();
    loadConfig();
  };

  const handleSwitchMode = async (mode: "direct" | "watch") => {
    setSwitching(true);
    try {
      const res = await fetch("/api/capture/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      setCapture(await res.json());
    } catch {}
    setSwitching(false);
  };

  const activeSession = sessions.find((s) => s.status === "active");

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr + "Z");
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.brand}>StudioRelay</span>
        <span style={styles.label}>Host</span>
      </div>

      {/* Event Management */}
      <div style={styles.section}>
        <p style={styles.sectionLabel}>Event</p>

        {activeEvent ? (
          <div style={styles.eventCard}>
            <div style={styles.eventCardMain}>
              <span style={styles.eventName}>{activeEvent.name}</span>
              <span style={styles.eventMeta}>
                {activeEvent.sessionCount} sessions
              </span>
            </div>
            <span style={styles.liveBadge}>Active</span>
          </div>
        ) : (
          <p style={styles.noActive}>No event — create one to start</p>
        )}

        {/* Event list / switcher */}
        {events.length > 1 && (
          <div style={styles.eventList}>
            {events
              .filter((e) => e.id !== activeEvent?.id)
              .map((e) => (
                <div key={e.id} style={styles.eventListItem}>
                  <div>
                    <span style={styles.eventListName}>{e.name}</span>
                    <span style={styles.eventListMeta}>
                      {e.sessionCount} sessions
                    </span>
                  </div>
                  <button
                    onClick={() => handleSwitchEvent(e.id)}
                    style={styles.switchBtn}
                  >
                    Switch
                  </button>
                </div>
              ))}
          </div>
        )}

        {showNewEvent ? (
          <div style={styles.newEventForm}>
            <input
              type="text"
              placeholder="Event name (e.g., Smith Wedding)"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateEvent()}
              style={styles.input}
              autoFocus
            />
            <div style={styles.formActions}>
              <button onClick={() => setShowNewEvent(false)} style={styles.cancelBtn}>
                Cancel
              </button>
              <button onClick={handleCreateEvent} style={styles.confirmBtn}>
                Create
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowNewEvent(true)} style={styles.newEventBtn}>
            + New Event
          </button>
        )}
      </div>

      {/* Capture Mode */}
      <div style={styles.section}>
        <p style={styles.sectionLabel}>Capture</p>
        <div style={styles.modeSelector}>
          <button
            onClick={() => handleSwitchMode("direct")}
            disabled={switching}
            style={{
              ...styles.modeBtn,
              ...(capture?.mode === "direct" ? styles.modeBtnActive : {}),
            }}
          >
            <span style={styles.modeBtnTitle}>Direct</span>
            <span style={styles.modeBtnDesc}>gphoto2 tethered</span>
          </button>
          <button
            onClick={() => handleSwitchMode("watch")}
            disabled={switching}
            style={{
              ...styles.modeBtn,
              ...(capture?.mode === "watch" ? styles.modeBtnActive : {}),
            }}
          >
            <span style={styles.modeBtnTitle}>Watch</span>
            <span style={styles.modeBtnDesc}>Folder monitor</span>
          </button>
        </div>
        {capture && (
          <div style={styles.statusRow}>
            <span style={styles.statusLabel}>Status</span>
            <span style={{ color: capture.active ? "#2dd4a8" : "#F06060", fontSize: 13 }}>
              {capture.active ? "Active" : "Stopped"}
              {capture.cameraName && ` — ${capture.cameraName}`}
            </span>
          </div>
        )}
      </div>

      {/* Session Controls */}
      <div style={styles.section}>
        <p style={styles.sectionLabel}>Sessions</p>
        {activeSession && (
          <div style={{
            ...styles.activeSessionCard,
            borderLeftColor: activeSession.color,
          }}>
            <div style={{ ...styles.activeDot, background: activeSession.color }} />
            <span>Session {activeSession.sessionNumber}</span>
            <span style={styles.sessionMeta}>
              {activeSession.photoCount} photos
            </span>
          </div>
        )}
        <motion.button
          onClick={() => createSession()}
          style={styles.newSessionBtn}
          whileTap={{ scale: 0.97 }}
          disabled={!activeEvent}
        >
          + New Session
        </motion.button>

        {/* Session list */}
        <div style={styles.sessionList}>
          {sessions.map((s) => (
            <div key={s.id} style={{ ...styles.sessionItem, borderLeftColor: s.color }}>
              <span style={{ ...styles.sessionNum, color: s.color }}>
                {String(s.sessionNumber).padStart(2, "0")}
              </span>
              <span style={styles.sessionTime}>{formatTime(s.createdAt)}</span>
              <span style={styles.sessionPhotos}>{s.photoCount} photos</span>
              {s.status === "active" && <span style={styles.sessionLive}>Live</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: "100%",
    overflow: "auto",
    background: "#0a0a0a",
    color: "#f0f0f0",
    fontFamily: "Inter, -apple-system, system-ui, sans-serif",
    padding: "24px 32px 60px",
    maxWidth: 600,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 36,
  },
  brand: { fontSize: 13, fontWeight: 300, letterSpacing: "0.2em", textTransform: "uppercase" as const, color: "#4a4a4a" },
  label: { fontSize: 11, fontWeight: 400, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#F3B562", padding: "4px 10px", border: "1px solid rgba(243, 181, 98, 0.3)" },
  section: { marginBottom: 32 },
  sectionLabel: { fontSize: 11, fontWeight: 300, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: "#444", marginBottom: 12 },
  // Event
  eventCard: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "#111", border: "1px solid #1e1e1e", marginBottom: 8 },
  eventCardMain: { display: "flex", flexDirection: "column" as const, gap: 2 },
  eventName: { fontSize: 16, fontWeight: 500, color: "#f0f0f0" },
  eventMeta: { fontSize: 12, color: "#555", fontWeight: 300 },
  liveBadge: { fontSize: 10, fontWeight: 400, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#2dd4a8", padding: "3px 8px", border: "1px solid rgba(45, 212, 168, 0.3)" },
  noActive: { fontSize: 14, color: "#333", fontWeight: 300 },
  eventList: { display: "flex", flexDirection: "column" as const, gap: 4, marginBottom: 12 },
  eventListItem: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#0e0e0e", border: "1px solid #1a1a1a" },
  eventListName: { fontSize: 14, fontWeight: 400, color: "#aaa", display: "block" },
  eventListMeta: { fontSize: 11, color: "#444", fontWeight: 300 },
  switchBtn: { fontSize: 11, fontWeight: 400, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#888", background: "transparent", border: "1px solid #333", padding: "6px 14px", fontFamily: "inherit", cursor: "pointer" },
  newEventBtn: { width: "100%", padding: "14px", fontSize: 13, fontWeight: 400, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#fff", background: "#4353FF", border: "none", fontFamily: "inherit", cursor: "pointer", marginTop: 8 },
  newEventForm: { marginTop: 8 },
  input: { width: "100%", padding: "14px 16px", background: "#111", border: "1px solid #222", color: "#f0f0f0", fontSize: 16, fontFamily: "inherit", fontWeight: 300, outline: "none", marginBottom: 10 },
  formActions: { display: "flex", gap: 8, justifyContent: "flex-end" },
  cancelBtn: { padding: "10px 20px", fontSize: 12, color: "#555", background: "transparent", border: "1px solid #222", fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.06em" },
  confirmBtn: { padding: "10px 20px", fontSize: 12, color: "#fff", background: "#4353FF", border: "none", fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.06em" },
  // Capture
  modeSelector: { display: "flex", gap: 4, marginBottom: 12 },
  modeBtn: { flex: 1, padding: "12px 16px", background: "#111", border: "1px solid #1e1e1e", cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const, transition: "all 0.2s" },
  modeBtnActive: { borderColor: "#F3B562", background: "#1a1608" },
  modeBtnTitle: { display: "block", fontSize: 14, fontWeight: 400, color: "#e0e0e0", marginBottom: 2 },
  modeBtnDesc: { display: "block", fontSize: 11, color: "#555", fontWeight: 300 },
  statusRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" },
  statusLabel: { fontSize: 12, color: "#555", fontWeight: 300 },
  // Sessions
  activeSessionCard: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#111", borderLeft: "3px solid transparent", marginBottom: 8 },
  activeDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  sessionMeta: { marginLeft: "auto", fontSize: 12, color: "#555", fontWeight: 300 },
  newSessionBtn: { width: "100%", padding: "14px", fontSize: 13, fontWeight: 400, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#fff", background: "#5C4B51", border: "none", fontFamily: "inherit", cursor: "pointer", marginBottom: 12 },
  sessionList: { display: "flex", flexDirection: "column" as const, gap: 3 },
  sessionItem: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#0e0e0e", borderLeft: "3px solid transparent", fontSize: 13 },
  sessionNum: { fontWeight: 600, fontFamily: "monospace", width: 28 },
  sessionTime: { fontSize: 12, color: "#555", fontWeight: 300 },
  sessionPhotos: { marginLeft: "auto", fontSize: 12, color: "#444", fontWeight: 300 },
  sessionLive: { fontSize: 10, color: "#2dd4a8", letterSpacing: "0.06em", textTransform: "uppercase" as const },
};
