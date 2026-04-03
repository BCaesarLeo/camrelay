# StudioRelay

Tethered photo booth system for professional event photography. Camera captures photos, guests browse and select on a touchscreen, then download via QR code to their phone.

## How It Works

```
Camera (Sony/Nikon) --USB--> Mac running StudioRelay
                               |
                          Local WiFi
                               |
                    +----------+----------+
                    |                     |
              Touchscreen            Guest's Phone
              (Chrome kiosk)         (scans QR code)
              Browse & select        Downloads photos
```

## Quick Start

```bash
npm install
npm run dev          # Starts backend + frontend dev server
```

Production:
```bash
npm run build
npm start            # Serves on port 3100
```

Open `http://localhost:3100` for the guest-facing kiosk.
Open `http://localhost:3100/host` for the photographer admin panel.

## Configuration

Copy `.env.example` to `.env` and configure:

```
PORT=3100
WATCH_FOLDER=/path/to/tethered/capture/folder
EVENT_NAME=My Event
WIFI_NETWORK=MyWiFi
WIFI_PASSWORD=password123
```

## Camera Setup

### Direct Mode (Sony Camera Remote SDK)
Supports Sony cameras (A9 II, A7 series, etc.) via USB. The SDK tether helper auto-connects and downloads photos as you shoot.

Requires: Sony Camera Remote SDK (`native/sony-sdk/`)

### Watch Mode (Any Camera)
Use any tethering software (Capture One, Lightroom, NX Tether) that writes files to a folder. StudioRelay watches the folder and picks up new photos automatically.

## Event Flow

1. **Photographer** creates an Event and starts Sessions via the `+` button
2. **Camera** captures photos -> auto-processed (RAW to JPEG + thumbnails)
3. **Guest** walks up to touchscreen, finds their session, selects favorites
4. **Guest** enters name/email/phone on the contact form
5. **QR screen** shows WiFi QR + Download QR side by side
6. **Guest** scans WiFi QR to connect, then Download QR to get photos
7. **Android**: Photos auto-download individually to Gallery
8. **iPhone**: ZIP download (App Clip saves directly to Photos when approved)

## Tech Stack

- **Backend**: Fastify + TypeScript, SQLite (better-sqlite3), Sharp (image processing)
- **Frontend**: React 19, Vite, Zustand, Framer Motion
- **Camera**: Sony Camera Remote SDK (C++), gphoto2 fallback, folder watch mode
- **iOS App Clip**: SwiftUI app for direct save-to-Photos (native/StudioRelay/)
- **Design**: Glam128-inspired dark minimal aesthetic

## Project Structure

```
server/           Backend (Fastify)
  capture/        Camera tethering (Sony SDK, gphoto2, watch mode)
  pipeline/       RAW -> JPEG conversion (sips + sharp)
  routes/         API endpoints (sessions, photos, download, contacts, events)
  ws/             WebSocket for live photo updates
client/           Frontend (React + Vite)
  components/     UI screens (SessionsList, SessionView, ReviewScreen, QRScreen, etc.)
  hooks/          State management (Zustand store, WebSocket)
shared/           Shared TypeScript types
native/           iOS App Clip + Sony SDK tether helper
workers/          Cloudflare Worker (AASA for App Clip)
prototype/        Static HTML prototypes
storage/          Runtime data (photos, DB) - gitignored
```

## License

Private - All rights reserved.
