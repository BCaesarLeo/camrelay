import { useEffect, useState } from "react";

// What has and hasn't gone out. Every request is saved the moment a guest taps
// send; when email or text is down it waits here and goes out by itself once the
// connection is back. Staff can also push it, or fix a mistyped address.

interface DeliveryContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  sessionNumber: number | null;
  photoCount: number;
  createdAt: string;
  emailSent: boolean;
  smsSent: boolean;
  attempts: number;
  error: string | null;
  status: "sent" | "waiting" | "retrying" | "stuck";
}

export function DeliveryPanel() {
  const [online, setOnline] = useState(true);
  const [contacts, setContacts] = useState<DeliveryContact[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const refresh = async () => {
    try {
      const res = await fetch("/api/delivery").then((r) => r.json());
      setOnline(res.online);
      setContacts(res.contacts);
    } catch {}
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  const sent = contacts.filter((c) => c.status === "sent");
  const unsent = contacts.filter((c) => c.status !== "sent");
  const problems = unsent.filter((c) => c.status !== "waiting");

  const sendNow = async () => {
    setBusy(true);
    const res = await fetch("/api/delivery/retry-all", { method: "POST" }).then((r) => r.json());
    setNote(
      res.online
        ? `Sending ${res.queued} now…`
        : `No internet right now — ${res.queued} will go out as soon as it's back`
    );
    setBusy(false);
    refresh();
  };

  const retry = async (contact: DeliveryContact, fix: boolean) => {
    let body = {};
    if (fix) {
      const email = window.prompt(`Email for ${contact.name}`, contact.email ?? "");
      if (email === null) return;
      const phone = window.prompt(`Phone for ${contact.name} (leave empty for none)`, contact.phone ?? "");
      if (phone === null) return;
      body = { email, phone };
    }
    const res = await fetch(`/api/delivery/${contact.id}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setNote((await res.json().catch(() => null))?.error ?? "Couldn't retry");
    refresh();
  };

  const channel = (c: DeliveryContact) =>
    [
      c.email && `${c.email}${c.emailSent ? " ✓" : ""}`,
      c.phone && `${c.phone}${c.smsSent ? " ✓" : ""}`,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div>
      <div style={styles.summary}>
        <span style={{ ...styles.dot, background: online ? "#2dd4a8" : "#F06060" }} />
        <span style={styles.summaryText}>
          {online ? "Internet up" : "No internet — requests are being saved"}
        </span>
        <span style={styles.counts}>
          {sent.length} sent · {unsent.length} waiting
          {problems.length > 0 && <span style={{ color: "#F3B562" }}> · {problems.length} with problems</span>}
        </span>
      </div>

      {unsent.length > 0 && (
        <button onClick={sendNow} disabled={busy} style={{ ...styles.sendBtn, opacity: busy ? 0.5 : 1 }}>
          Send {unsent.length} now
        </button>
      )}
      {note && <p style={styles.note}>{note}</p>}

      <div style={styles.list}>
        {unsent.map((c) => (
          <div key={c.id} style={styles.item}>
            <div style={styles.itemMain}>
              <span style={styles.name}>
                {c.name}
                <span style={styles.meta}>
                  {" "}
                  · session {c.sessionNumber ?? "?"} · {c.photoCount} photos
                </span>
              </span>
              <span style={styles.meta}>{channel(c)}</span>
              <span style={{ ...styles.meta, color: c.status === "waiting" ? "#555" : "#F3B562" }}>
                {c.status === "waiting"
                  ? online
                    ? "Queued — sending shortly"
                    : "Saved — will send when the internet is back"
                  : `${c.status === "stuck" ? "Keeps failing" : "Will retry"}: ${c.error ?? "unknown error"}`}
              </span>
            </div>
            <div style={styles.itemActions}>
              <button onClick={() => retry(c, true)} style={styles.smallBtn}>
                Fix
              </button>
              <button onClick={() => retry(c, false)} style={styles.smallBtn}>
                Retry
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  summary: { display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "#111", border: "1px solid #1e1e1e", marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  summaryText: { fontSize: 13, color: "#e0e0e0" },
  counts: { marginLeft: "auto", fontSize: 12, color: "#777", fontWeight: 300 },
  sendBtn: { width: "100%", padding: "14px", fontSize: 13, fontWeight: 400, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#fff", background: "#4353FF", border: "none", fontFamily: "inherit", cursor: "pointer", marginBottom: 8 },
  note: { fontSize: 13, color: "#2dd4a8", fontWeight: 300, marginBottom: 8 },
  list: { display: "flex", flexDirection: "column" as const, gap: 3 },
  item: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#0e0e0e", border: "1px solid #1a1a1a" },
  itemMain: { display: "flex", flexDirection: "column" as const, gap: 2, minWidth: 0, flex: 1 },
  name: { fontSize: 14, color: "#f0f0f0" },
  meta: { fontSize: 12, color: "#666", fontWeight: 300, wordBreak: "break-word" as const },
  itemActions: { display: "flex", gap: 6, flexShrink: 0 },
  smallBtn: { fontSize: 11, color: "#aaa", letterSpacing: "0.06em", textTransform: "uppercase" as const, background: "none", border: "1px solid #333", padding: "6px 10px", fontFamily: "inherit", cursor: "pointer" },
};
