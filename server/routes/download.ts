import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { config } from "../config.js";
import QRCode from "qrcode";
import archiver from "archiver";
import path from "path";
import os from "os";
import type { DownloadInfo } from "../../shared/types.js";

const createToken = db.prepare(`
  INSERT INTO download_tokens (token, session_id, expires_at)
  VALUES (?, ?, datetime('now', '+' || ? || ' hours'))
`);

const getToken = db.prepare(`
  SELECT * FROM download_tokens WHERE token = ? AND expires_at > datetime('now')
`);

const incrementDownload = db.prepare(`
  UPDATE download_tokens SET download_count = download_count + 1 WHERE token = ?
`);

const getSelectedPhotos = db.prepare(`
  SELECT * FROM photos WHERE session_id = ? AND selected = 1 AND status = 'ready'
`);

const getSession = db.prepare(`
  SELECT * FROM sessions WHERE id = ?
`);

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

export async function downloadRoutes(app: FastifyInstance) {
  // Generate download link + QR for a session
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/download-link",
    async (req, reply) => {
      const session = getSession.get(req.params.id) as any;
      if (!session) return reply.status(404).send({ error: "Session not found" });

      const token = nanoid(21);
      createToken.run(token, req.params.id, config.downloadTokenExpiryHours);

      const lanIp = getLanIp();
      // Local-only URL — works on event WiFi without internet
      const downloadUrl = `http://${lanIp}:${config.port}/dl/${token}`;
      const qrDataUrl = await QRCode.toDataURL(downloadUrl, {
        width: 600,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      const { count } = db
        .prepare(
          "SELECT COUNT(*) as count FROM photos WHERE session_id = ? AND selected = 1"
        )
        .get(req.params.id) as { count: number };

      // Generate WiFi QR if configured
      let wifiQrDataUrl: string | null = null;
      if (config.wifiNetwork) {
        const wifiString = `WIFI:T:WPA;S:${config.wifiNetwork};P:${config.wifiPassword || ""};;`;
        wifiQrDataUrl = await QRCode.toDataURL(wifiString, {
          width: 600,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        });
      }

      return {
        downloadUrl,
        qrDataUrl,
        wifiQrDataUrl,
        selectedCount: count,
      };
    }
  );

  // JSON API for App Clip — returns photo URLs for native save-to-photos
  // MUST be before /dl/:token so it matches first
  app.get<{ Params: { token: string } }>("/dl/:token/api", async (req, reply) => {
    const tokenRow = getToken.get(req.params.token) as any;
    if (!tokenRow) return reply.status(404).send({ error: "Token expired" });

    const photos = getSelectedPhotos.all(tokenRow.session_id) as any[];

    function photoThumbUrlApi(p: any): string {
      if (p.thumb_path) {
        const idx = p.thumb_path.indexOf("/storage/");
        if (idx !== -1) return p.thumb_path.substring(idx);
      }
      return `/storage/photos/thumb/${p.id}.jpg`;
    }

    return {
      eventName: config.eventName,
      sessionId: tokenRow.session_id,
      photos: photos.map((p: any) => ({
        id: p.id,
        thumbnail: photoThumbUrlApi(p),
        full: `/dl/${req.params.token}/photo/${p.id}`,
      })),
    };
  });

  // Download page (server-rendered for phones)
  app.get<{ Params: { token: string } }>("/dl/:token", async (req, reply) => {
    const tokenRow = getToken.get(req.params.token) as any;
    if (!tokenRow) {
      return reply.status(404).type("text/html").send(`
        <!DOCTYPE html>
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Link Expired</title>
        <style>body{font-family:-apple-system,system-ui,sans-serif;text-align:center;padding:60px 20px;background:#111;color:#fff;}h1{font-size:24px;}</style>
        </head><body><h1>This download link has expired.</h1><p>Please request a new QR code.</p></body></html>
      `);
    }

    const photos = getSelectedPhotos.all(tokenRow.session_id) as any[];
    const session = getSession.get(tokenRow.session_id) as any;

    function thumbUrl(photo: any): string {
      if (photo.thumb_path) {
        const idx = photo.thumb_path.indexOf("/storage/");
        if (idx !== -1) return photo.thumb_path.substring(idx);
      }
      return `/storage/photos/thumb/${photo.id}.jpg`;
    }

    const photoGrid = photos
      .map(
        (p) => `
        <div class="photo">
          <img src="${thumbUrl(p)}" alt="${p.original_filename}" loading="lazy">
          <a href="/dl/${req.params.token}/photo/${p.id}" class="save-btn">Save</a>
        </div>`
      )
      .join("");

    const photoUrls = photos.map((p: any) => `/dl/${req.params.token}/photo/${p.id}`);

    const thumbGrid = photos
      .map(
        (p: any, i: number) => `
        <div class="thumb">
          <img src="${thumbUrl(p)}" alt="Photo ${i + 1}">
          <div class="check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
        </div>`
      )
      .join("");

    return reply.type("text/html").send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>${config.eventName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, system-ui, sans-serif; background: #0a0a0a; color: #f0f0f0; padding: 20px 20px 100px; }
          .brand { text-align: center; font-size: 10px; font-weight: 300; letter-spacing: 0.2em; text-transform: uppercase; color: #333; margin: 16px 0 24px; }
          h1 { font-size: 20px; font-weight: 300; letter-spacing: -0.01em; text-align: center; margin-bottom: 4px; }
          .subtitle { text-align: center; color: #555; font-size: 13px; font-weight: 300; margin-bottom: 24px; }
          .save-btn {
            display: block; width: 100%; padding: 18px;
            background: #4353FF; color: #fff; text-align: center;
            border: none; font-size: 15px; font-weight: 400; font-family: inherit;
            letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer;
            margin-bottom: 8px;
          }
          .save-btn:active { opacity: 0.8; }
          .save-btn:disabled { opacity: 0.4; }
          .save-btn.done { background: #2dd4a8; }
          .status { text-align: center; color: #555; font-size: 12px; font-weight: 300; min-height: 18px; margin-bottom: 6px; }
          .progress { width: 100%; height: 3px; background: #1a1a1a; margin-bottom: 20px; overflow: hidden; }
          .progress-bar { height: 100%; background: #4353FF; width: 0%; transition: width 0.3s; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; }
          .thumb { position: relative; }
          .thumb img { width: 100%; display: block; aspect-ratio: 3/2; object-fit: cover; }
          .thumb .check { position: absolute; bottom: 4px; right: 4px; width: 18px; height: 18px; border-radius: 50%; background: #2dd4a8; display: none; align-items: center; justify-content: center; }
          .thumb.saved .check { display: flex; }
          .hint { text-align: center; color: #444; font-size: 11px; font-weight: 300; margin-top: 4px; margin-bottom: 16px; }
          .footer { text-align: center; margin-top: 24px; color: #1a1a1a; font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 300; }
        </style>
      </head>
      <body>
        <p class="brand">${config.eventName}</p>
        <h1>Your photos</h1>
        <p class="subtitle">${photos.length} photo${photos.length !== 1 ? "s" : ""}</p>
        <button class="save-btn" id="saveBtn">Save to Photos</button>
        <div class="progress"><div class="progress-bar" id="bar"></div></div>
        <p class="status" id="status"></p>
        <p class="hint" id="hint"></p>
        <div class="grid" id="grid">${thumbGrid}</div>
        <p class="footer">StudioRelay</p>
        <script>
          var photoUrls = ${JSON.stringify(photoUrls)};
          var zipUrl = '/dl/${req.params.token}/zip';
          var btn = document.getElementById('saveBtn');
          var status = document.getElementById('status');
          var hint = document.getElementById('hint');
          var bar = document.getElementById('bar');
          var thumbs = document.querySelectorAll('.thumb');
          var total = photoUrls.length;
          var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

          btn.addEventListener('click', async function() {
            btn.disabled = true;

            if (!isIOS) {
              // Android + all non-Apple: auto-download each JPEG individually
              // Downloaded JPEGs appear in Android Gallery automatically
              for (var i = 0; i < total; i++) {
                status.textContent = 'Saving ' + (i + 1) + ' of ' + total + '...';
                bar.style.width = ((i + 1) / total * 100) + '%';

                var a = document.createElement('a');
                a.href = photoUrls[i];
                a.download = 'StudioRelay_' + (i + 1) + '.jpg';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                if (thumbs[i]) thumbs[i].classList.add('saved');
                await new Promise(function(r) { setTimeout(r, 600); });
              }
              status.textContent = 'All ' + total + ' photos saved!';
              hint.textContent = 'Check your Gallery or Photos app';
              btn.textContent = 'Saved';
              btn.classList.add('done');
            } else {
              // iPhone: download ZIP
              status.textContent = 'Downloading ' + total + ' photos...';
              bar.style.width = '100%';
              window.location.href = zipUrl;
              setTimeout(function() {
                status.textContent = 'Downloaded!';
                hint.textContent = 'Open Files app → tap the ZIP → select all → Share → Save to Photos';
                btn.textContent = 'Downloaded';
                btn.classList.add('done');
              }, 2000);
            }
            btn.disabled = false;
          });
        </script>
      </body>
      </html>
    `);
  });

  // Download individual photo
  app.get<{ Params: { token: string; photoId: string } }>(
    "/dl/:token/photo/:photoId",
    async (req, reply) => {
      const tokenRow = getToken.get(req.params.token) as any;
      if (!tokenRow) return reply.status(404).send({ error: "Token expired" });

      const photo = db
        .prepare("SELECT * FROM photos WHERE id = ? AND session_id = ?")
        .get(req.params.photoId, tokenRow.session_id) as any;
      if (!photo || !photo.full_path)
        return reply.status(404).send({ error: "Photo not found" });

      incrementDownload.run(req.params.token);
      const filename = photo.original_filename.replace(/\.[^.]+$/, ".jpg");
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      return reply.sendFile(
        path.basename(photo.full_path),
        path.dirname(photo.full_path),
        {
          cacheControl: false,
        }
      );
    }
  );

  // Download all as zip
  app.get<{ Params: { token: string } }>(
    "/dl/:token/zip",
    async (req, reply) => {
      const tokenRow = getToken.get(req.params.token) as any;
      if (!tokenRow) return reply.status(404).send({ error: "Token expired" });

      const photos = getSelectedPhotos.all(tokenRow.session_id) as any[];
      if (photos.length === 0)
        return reply.status(404).send({ error: "No photos" });

      const session = getSession.get(tokenRow.session_id) as any;
      incrementDownload.run(req.params.token);

      const archive = archiver("zip", { zlib: { level: 1 } }); // fast compression since JPEGs are already compressed

      reply
        .type("application/zip")
        .header(
          "Content-Disposition",
          `attachment; filename="photos-${session.short_code}.zip"`
        );

      for (const photo of photos) {
        if (photo.full_path) {
          archive.file(photo.full_path, { name: photo.original_filename.replace(/\.[^.]+$/, ".jpg") });
        }
      }

      archive.finalize();
      return reply.send(archive);
    }
  );
}
