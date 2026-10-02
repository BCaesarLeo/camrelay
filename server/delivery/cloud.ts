import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import twilio from "twilio";
import sharp from "sharp";
import { db } from "../db.js";
import { config } from "../config.js";
import { isOnline } from "./index.js";
import fs from "fs";
import path from "path";

let _twilioClient: ReturnType<typeof twilio> | null = null;
function getTwilio() {
  if (!_twilioClient && process.env.TWILIO_ACCOUNT_SID) {
    _twilioClient = twilio(
      process.env.TWILIO_API_KEY_SID || process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY_SECRET || "",
      { accountSid: process.env.TWILIO_ACCOUNT_SID }
    );
  }
  return _twilioClient;
}

const s3 = new S3Client({ region: "us-east-1" });
const ses = new SESClient({ region: "us-east-1" });

const BUCKET = "studiorelay-photos";
const CDN_DOMAIN = "https://d2kzchvzabp5a9.cloudfront.net";
const FROM_EMAIL = "photos@dcav.pro";

let uploading = false;

// A contact that keeps failing is retried with growing gaps (30s, 1m, 2m … 10m, then
// hourly) and always after the ones that haven't failed, so one bad address or missing
// photo can never hold up everyone else. Problems show on the Host page, where staff
// can fix the address and retry straight away.
export const STUCK_AFTER_ATTEMPTS = 8;
const BATCH_SIZE = 10;

function retryDelayMs(attempts: number): number {
  if (attempts === 0) return 0;
  if (attempts >= STUCK_AFTER_ATTEMPTS) return 3600 * 1000;
  return Math.min(600, 30 * 2 ** (attempts - 1)) * 1000;
}

function sqliteTimeMs(value: string): number {
  return new Date(value.replace(" ", "T") + "Z").getTime();
}

const recordFailure = db.prepare(`
  UPDATE contacts SET attempts = attempts + 1, last_attempt_at = datetime('now'), delivery_error = ?
  WHERE id = ?
`);

// Start the background upload + email loop
export function startCloudSync() {
  // Run every 30 seconds
  setInterval(processQueue, 30000);
  console.log("[cloud] Sync started — will upload when internet is available");
}

// Run the queue right away (used by "Send now" / "Retry" on the Host page)
export function kickCloudSync() {
  processQueue();
}

async function processQueue() {
  if (!isOnline() || uploading) return;
  uploading = true;

  try {
    // Everything not fully delivered yet — by email, by text, or both
    const pending = db
      .prepare(
        `SELECT c.*, e.name as event_name
         FROM contacts c
         LEFT JOIN events e ON c.event_id = e.id
         WHERE c.synced = 0
           AND ((c.email IS NOT NULL AND c.email != '') OR (c.phone IS NOT NULL AND c.phone != ''))
         ORDER BY c.attempts ASC, c.created_at ASC`
      )
      .all() as any[];

    const now = Date.now();
    const due = pending
      .filter(
        (c) => !c.last_attempt_at || now - sqliteTimeMs(c.last_attempt_at) >= retryDelayMs(c.attempts)
      )
      .slice(0, BATCH_SIZE);

    for (const contact of due) {
      try {
        await processContact(contact);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        recordFailure.run(msg, contact.id);
        console.error(`[cloud] Delivery failed for ${contact.name}:`, msg);
      }
    }
  } catch (err) {
    console.error("[cloud] Sync error:", err);
  } finally {
    uploading = false;
  }
}

async function processContact(contact: any) {
  const photoIds: string[] = JSON.parse(contact.selected_photo_ids || "[]");
  if (photoIds.length === 0) {
    db.prepare("UPDATE contacts SET synced = 1 WHERE id = ?").run(contact.id);
    return;
  }

  const photos = photoIds
    .map((id) => db.prepare("SELECT * FROM photos WHERE id = ?").get(id) as any)
    .filter(Boolean);

  // Still converting — not a failure, just check again on the next pass
  if (photos.some((p) => p.status === "processing")) return;

  // A photo that never converted is left out rather than blocking the rest
  const usable = photos.filter((p) => p.full_path && fs.existsSync(p.full_path));
  if (usable.length === 0) {
    throw new Error("None of the selected photos could be found on disk");
  }

  const eventName = contact.event_name || config.eventName;
  const s3Prefix = `delivery/${contact.event_id}/${contact.id}`;

  console.log(`[cloud] Uploading ${usable.length} photos for ${contact.name}...`);

  // Upload each photo to S3 (full-res + MMS-sized for Twilio)
  const uploadedUrls: string[] = [];
  const mmsUrls: string[] = [];
  for (const photo of usable) {
    const key = `${s3Prefix}/${photo.id}.jpg`;
    const mmsKey = `mms/${contact.event_id}/${contact.id}/${photo.id}.jpg`;

    try {
      const fileBuffer = fs.readFileSync(photo.full_path);

      // Upload full-res for email/download
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: fileBuffer,
          ContentType: "image/jpeg",
        })
      );
      uploadedUrls.push(`${CDN_DOMAIN}/${key}`);

      // Generate MMS-sized version (1600px, under 5MB for Twilio)
      const mmsBuffer = await sharp(fileBuffer)
        .rotate()
        .resize(1600, null, { withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: mmsKey,
          Body: mmsBuffer,
          ContentType: "image/jpeg",
        })
      );
      mmsUrls.push(`${CDN_DOMAIN}/${mmsKey}`);
    } catch (err) {
      // Don't send a link until every photo behind it is uploaded
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Upload failed: ${msg}`);
    }
  }

  // All uploaded — generate the download page
  const downloadPageKey = `${s3Prefix}/index.html`;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: downloadPageKey,
        Body: generateDownloadPage(eventName, contact.name, uploadedUrls),
        ContentType: "text/html",
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Upload failed: ${msg}`);
  }
  const downloadUrl = `${CDN_DOMAIN}/${downloadPageKey}`;
  const count = usable.length;
  const problems: string[] = [];

  // Email — skipped if an earlier attempt already got it out
  if (contact.email && !contact.email_sent) {
    try {
      await sendEmail(contact.email, contact.name, eventName, downloadUrl, count);
      db.prepare("UPDATE contacts SET email_sent = 1, email_error = NULL WHERE id = ?").run(contact.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      db.prepare("UPDATE contacts SET email_error = ? WHERE id = ?").run(msg, contact.id);
      problems.push(`Email: ${msg}`);
    }
  }

  // Text with permanent S3 download link via Twilio — same rule, never sent twice
  if (contact.phone && !contact.sms_sent) {
    try {
      let cleanPhone = contact.phone.replace(/[^+\d]/g, "");
      if (!cleanPhone.startsWith("+")) cleanPhone = "+1" + cleanPhone;

      const client = getTwilio();
      const msgSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
      if (!client || !msgSid) throw new Error("Twilio is not configured");

      // Send MMS with MMS-sized photos (max 10 per message, batch if more)
      for (let batch = 0; batch < mmsUrls.length; batch += 10) {
        const mediaUrls = mmsUrls.slice(batch, batch + 10);
        const isFirst = batch === 0;

        await client.messages.create({
          body: isFirst
            ? `${eventName}: Hi ${contact.name}! Here ${count !== 1 ? "are" : "is"} your ${count} photo${count !== 1 ? "s" : ""} from the event.\n\nDownload full-resolution: ${downloadUrl}`
            : `Photos continued (${batch + 1}-${Math.min(batch + 10, mmsUrls.length)} of ${mmsUrls.length})`,
          messagingServiceSid: msgSid,
          to: cleanPhone,
          mediaUrl: mediaUrls,
        });

        if (batch + 10 < mmsUrls.length) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      db.prepare("UPDATE contacts SET sms_sent = 1, sms_error = NULL WHERE id = ?").run(contact.id);
      console.log(`[cloud] SMS sent to ${cleanPhone} for ${contact.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      db.prepare("UPDATE contacts SET sms_error = ? WHERE id = ?").run(msg, contact.id);
      problems.push(`Text: ${msg}`);
    }
  }

  // Done only when every channel the guest asked for has gone out
  if (problems.length > 0) throw new Error(problems.join(" · "));

  db.prepare("UPDATE contacts SET synced = 1, delivery_error = NULL WHERE id = ?").run(contact.id);
  console.log(`[cloud] Delivered to ${contact.name} (email: ${!!contact.email}, sms: ${!!contact.phone})`);
}

async function sendEmail(
  to: string,
  name: string,
  eventName: string,
  downloadUrl: string,
  photoCount: number
) {
  await ses.send(
    new SendEmailCommand({
      Source: `${eventName} <${FROM_EMAIL}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: {
          Data: `Your photos from ${eventName}`,
        },
        Body: {
          Html: {
            Data: generateEmailHtml(name, eventName, downloadUrl, photoCount),
          },
          Text: {
            Data: `Hi ${name},\n\nYour ${photoCount} photos from ${eventName} are ready!\n\nDownload them here: ${downloadUrl}\n\nThank you for attending!`,
          },
        },
      },
    })
  );
}

function generateEmailHtml(
  name: string,
  eventName: string,
  downloadUrl: string,
  photoCount: number
): string {
  return `
<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;">
        <tr><td style="padding:32px 0;text-align:center;">
          <p style="font-size:11px;font-weight:300;letter-spacing:3px;text-transform:uppercase;color:#444;margin:0 0 32px;">${eventName}</p>
          <h1 style="font-size:28px;font-weight:300;color:#f0f0f0;margin:0 0 8px;">Your photos are ready</h1>
          <p style="font-size:15px;color:#666;font-weight:300;margin:0 0 32px;">Hi ${name}, your ${photoCount} photo${photoCount !== 1 ? "s" : ""} from ${eventName} ${photoCount !== 1 ? "are" : "is"} ready to download.</p>
          <a href="${downloadUrl}" style="display:inline-block;padding:16px 48px;background:#4353FF;color:#fff;text-decoration:none;font-size:15px;font-weight:400;letter-spacing:2px;text-transform:uppercase;">View Photos</a>
          <p style="font-size:12px;color:#333;font-weight:300;margin:32px 0 0;">This link will be available for 30 days.</p>
        </td></tr>
        <tr><td style="padding:24px 0;text-align:center;border-top:1px solid #1a1a1a;">
          <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#222;font-weight:300;margin:0;">StudioRelay</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function generateDownloadPage(
  eventName: string,
  name: string,
  photoUrls: string[]
): string {
  const photoGrid = photoUrls
    .map(
      (url, i) => `
    <div style="margin-bottom:4px;">
      <img src="${url}" style="width:100%;display:block;" alt="Photo ${i + 1}">
      <a href="${url}" download="StudioRelay_${i + 1}.jpg" style="display:block;padding:12px;background:#4353FF;color:#fff;text-align:center;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Save Photo ${i + 1}</a>
    </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${eventName} — Your Photos</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,system-ui,sans-serif;background:#0a0a0a;color:#f0f0f0;padding:20px 20px 60px}
    .brand{text-align:center;font-size:10px;font-weight:300;letter-spacing:3px;text-transform:uppercase;color:#333;margin:16px 0 24px}
    h1{font-size:22px;font-weight:300;text-align:center;margin-bottom:4px}
    .sub{text-align:center;color:#555;font-size:13px;font-weight:300;margin-bottom:24px}
    .photos{max-width:600px;margin:0 auto}
    .footer{text-align:center;margin-top:32px;color:#1a1a1a;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:300}
  </style>
</head>
<body>
  <p class="brand">${eventName}</p>
  <h1>Hi ${name}</h1>
  <p class="sub">${photoUrls.length} photo${photoUrls.length !== 1 ? "s" : ""} from your session</p>
  <div class="photos">${photoGrid}</div>
  <p class="footer">StudioRelay</p>
</body>
</html>`;
}
