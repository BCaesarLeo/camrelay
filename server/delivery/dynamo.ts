import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "../db.js";
import { isOnline } from "./index.js";

const client = new DynamoDBClient({ region: "us-east-1" });
const dynamo = DynamoDBDocumentClient.from(client);

let syncing = false;

export function startDynamoSync() {
  // Sync every 45 seconds
  setInterval(syncToDynamo, 45000);
  console.log("[dynamo] Sync started — will sync when internet is available");
}

async function syncToDynamo() {
  if (!isOnline() || syncing) return;
  syncing = true;

  try {
    await syncEvents();
    await syncSessions();
    await syncContacts();
  } catch (err) {
    console.error("[dynamo] Sync error:", err);
  }

  syncing = false;
}

async function syncEvents() {
  const events = db
    .prepare("SELECT * FROM events")
    .all() as any[];

  for (const e of events) {
    try {
      await dynamo.send(
        new PutCommand({
          TableName: "StudioRelay-Events",
          Item: {
            id: e.id,
            name: e.name,
            sessionCount: e.session_count,
            createdAt: e.created_at,
          },
        })
      );
    } catch (err) {
      console.error(`[dynamo] Failed to sync event ${e.id}:`, err);
    }
  }
}

async function syncSessions() {
  const sessions = db
    .prepare("SELECT * FROM sessions")
    .all() as any[];

  for (const s of sessions) {
    try {
      await dynamo.send(
        new PutCommand({
          TableName: "StudioRelay-Sessions",
          Item: {
            id: s.id,
            eventId: s.event_id,
            shortCode: s.short_code,
            name: s.name,
            sessionNumber: s.session_number,
            color: s.color,
            status: s.status,
            photoCount: s.photo_count,
            selectedCount: s.selected_count,
            createdAt: s.created_at,
            completedAt: s.completed_at,
          },
        })
      );
    } catch (err) {
      console.error(`[dynamo] Failed to sync session ${s.id}:`, err);
    }
  }
}

async function syncContacts() {
  const contacts = db
    .prepare("SELECT * FROM contacts")
    .all() as any[];

  for (const c of contacts) {
    try {
      await dynamo.send(
        new PutCommand({
          TableName: "StudioRelay-Contacts",
          Item: {
            id: c.id,
            eventId: c.event_id,
            sessionId: c.session_id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            selectedPhotoIds: c.selected_photo_ids,
            downloadToken: c.download_token,
            localDownload: c.local_download === 1,
            smsSent: c.sms_sent === 1,
            smsError: c.sms_error,
            emailSent: c.email_sent === 1,
            emailError: c.email_error,
            synced: true,
            createdAt: c.created_at,
          },
        })
      );
    } catch (err) {
      console.error(`[dynamo] Failed to sync contact ${c.id}:`, err);
    }
  }
}
