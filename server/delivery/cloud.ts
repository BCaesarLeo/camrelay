import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { db } from "../db.js";
import { config } from "../config.js";
import { isOnline } from "./index.js";
import fs from "fs";
import path from "path";

const s3 = new S3Client({ region: "us-east-1" });
const ses = new SESClient({ region: "us-east-1" });

const BUCKET = "studiorelay-photos";
const FROM_EMAIL = "photos@dcav.pro";

let uploading = false;

// Start the background upload + email loop
export function startCloudSync() {
  // Run every 30 seconds
  setInterval(processQueue, 30000);
  console.log("[cloud] Sync started — will upload when internet is available");
}

async function processQueue() {
  if (!isOnline() || uploading) return;
  uploading = true;

  try {
    // Find contacts that haven't been synced yet and have email
    const pending = db
      .prepare(
        `SELECT c.*, e.name as event_name
         FROM contacts c
         LEFT JOIN events e ON c.event_id = e.id
         WHERE c.synced = 0
           AND c.email IS NOT NULL
           AND c.email != ''
         ORDER BY c.created_at ASC
         LIMIT 5`
      )
      .all() as any[];

    for (const contact of pending) {
      await processContact(contact);
    }
  } catch (err) {
    console.error("[cloud] Sync error:", err);
  }

  uploading = false;
}

async function processContact(contact: any) {
  const photoIds: string[] = JSON.parse(contact.selected_photo_ids || "[]");
  if (photoIds.length === 0) {
    db.prepare("UPDATE contacts SET synced = 1 WHERE id = ?").run(contact.id);
    return;
  }

  const eventName = contact.event_name || config.eventName;
  const s3Prefix = `delivery/${contact.event_id}/${contact.id}`;

  console.log(
    `[cloud] Uploading ${photoIds.length} photos for ${contact.name}...`
  );

  // Upload each photo to S3
  const uploadedUrls: string[] = [];
  for (const photoId of photoIds) {
    const photo = db
      .prepare("SELECT * FROM photos WHERE id = ?")
      .get(photoId) as any;
    if (!photo || !photo.full_path) continue;

    const key = `${s3Prefix}/${photoId}.jpg`;

    try {
      const fileBuffer = fs.readFileSync(photo.full_path);
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: fileBuffer,
          ContentType: "image/jpeg",
        })
      );
      uploadedUrls.push(
        `https://${BUCKET}.s3.amazonaws.com/${key}`
      );
    } catch (err) {
      console.error(`[cloud] Failed to upload ${photoId}:`, err);
      return; // Stop — don't send email if not all uploaded
    }
  }

  if (uploadedUrls.length !== photoIds.length) {
    console.log(`[cloud] Only ${uploadedUrls.length}/${photoIds.length} uploaded for ${contact.name}, skipping email`);
    return;
  }

  // All uploaded — generate download page and send email
  try {
    // Create a simple HTML download page on S3
    const downloadPageKey = `${s3Prefix}/index.html`;
    const downloadPage = generateDownloadPage(
      eventName,
      contact.name,
      uploadedUrls
    );

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: downloadPageKey,
        Body: downloadPage,
        ContentType: "text/html",
      })
    );

    const downloadUrl = `https://${BUCKET}.s3.amazonaws.com/${downloadPageKey}`;

    // Send email
    await sendEmail(contact.email, contact.name, eventName, downloadUrl, photoIds.length);

    // Mark as synced
    db.prepare(
      "UPDATE contacts SET synced = 1, email_sent = 1, email_error = NULL WHERE id = ?"
    ).run(contact.id);

    console.log(`[cloud] Email sent to ${contact.email} for ${contact.name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare("UPDATE contacts SET email_error = ? WHERE id = ?").run(
      msg,
      contact.id
    );
    console.error(`[cloud] Email failed for ${contact.name}:`, msg);
  }
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
