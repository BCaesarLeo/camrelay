import twilio from "twilio";
import { db } from "../db.js";
import { config } from "../config.js";
import os from "os";

// Lazy-init Twilio client (env vars loaded by dotenv in config.ts before this runs)
let _twilioClient: ReturnType<typeof twilio> | null = null;
function getTwilioClient() {
  if (!_twilioClient && process.env.TWILIO_ACCOUNT_SID) {
    _twilioClient = twilio(
      process.env.TWILIO_API_KEY_SID || process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN,
      { accountSid: process.env.TWILIO_ACCOUNT_SID }
    );
  }
  return _twilioClient;
}
function getTwilioMsgServiceSid() { return process.env.TWILIO_MESSAGING_SERVICE_SID || ""; }

let internetAvailable = false;
let checking = false;

// Check internet connectivity every 30 seconds
export function startInternetMonitor() {
  checkInternet();
  setInterval(checkInternet, 30000);
  // Also start the retry loop
  setInterval(retryFailedDeliveries, 60000);
}

async function checkInternet(): Promise<boolean> {
  if (checking) return internetAvailable;
  checking = true;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch("https://1.1.1.1", { signal: controller.signal, method: "HEAD" });
    clearTimeout(timeout);
    internetAvailable = true;
  } catch {
    internetAvailable = false;
  }
  checking = false;
  return internetAvailable;
}

export function isOnline(): boolean {
  return internetAvailable;
}

// Send SMS with download link
export async function sendSMS(
  contactId: string,
  phone: string,
  name: string,
  downloadToken: string,
  photoCount: number
): Promise<boolean> {
  const twilioClient = getTwilioClient();
  const msgServiceSid = getTwilioMsgServiceSid();
  if (!phone || !twilioClient || !msgServiceSid) return false;

  // Build the download URL — use local IP since they need to be on WiFi
  const lanIp = getLanIp();
  const downloadUrl = `http://${lanIp}:${config.port}/dl/${downloadToken}`;

  const body =
    `${config.eventName}: Hi ${name}! Your ${photoCount} photo${photoCount !== 1 ? "s" : ""} are ready. ` +
    `Connect to WiFi "${config.wifiNetwork || "event network"}" and open: ${downloadUrl}`;

  try {
    // Clean phone number — ensure it has country code
    let cleanPhone = phone.replace(/[^+\d]/g, "");
    if (!cleanPhone.startsWith("+")) {
      cleanPhone = "+1" + cleanPhone; // Default to US
    }

    await twilioClient.messages.create({
      body,
      messagingServiceSid: msgServiceSid,
      to: cleanPhone,
    });

    // Mark as sent
    db.prepare("UPDATE contacts SET sms_sent = 1, sms_error = NULL WHERE id = ?").run(
      contactId
    );
    console.log(`[delivery] SMS sent to ${cleanPhone} for ${name}`);
    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    db.prepare("UPDATE contacts SET sms_error = ? WHERE id = ?").run(
      errMsg,
      contactId
    );
    console.error(`[delivery] SMS failed for ${name}:`, errMsg);
    return false;
  }
}

// Update local download status when a token is used
export function markLocalDownload(token: string) {
  db.prepare(
    "UPDATE contacts SET local_download = 1 WHERE download_token = ?"
  ).run(token);
}

// SMS retry disabled — cloud.ts handles MMS with actual photos after S3 upload
async function retryFailedDeliveries() {
  return;
}

// Delivery status for every contact of an event, newest first
export function getDeliveryStatus(eventId: string | null) {
  const rows = db
    .prepare(
      `SELECT c.*, dt.download_count, s.session_number
       FROM contacts c
       LEFT JOIN download_tokens dt ON c.download_token = dt.token
       LEFT JOIN sessions s ON c.session_id = s.id
       WHERE (? IS NULL OR c.event_id = ?)
       ORDER BY c.created_at DESC`
    )
    .all(eventId, eventId) as any[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    sessionId: r.session_id,
    sessionNumber: r.session_number ?? null,
    photoCount: JSON.parse(r.selected_photo_ids || "[]").length,
    createdAt: r.created_at,
    localDownload: r.local_download === 1 || (r.download_count ?? 0) > 0,
    smsSent: r.sms_sent === 1,
    smsError: r.sms_error,
    emailSent: r.email_sent === 1,
    emailError: r.email_error,
    synced: r.synced === 1,
    attempts: r.attempts,
    error: r.delivery_error,
    status: getStatusLabel(r),
  }));
}

// sent: everything the guest asked for went out · waiting: queued, not tried yet
// retrying: failed, will try again soon · stuck: failed many times, needs a look
function getStatusLabel(r: any): "sent" | "waiting" | "retrying" | "stuck" {
  if (r.synced === 1) return "sent";
  if (r.attempts === 0) return "waiting";
  return r.attempts >= 8 ? "stuck" : "retrying";
}

function getLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }
  return "localhost";
}
