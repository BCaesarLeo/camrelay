# StudioRelay App Clip

iOS App Clip that saves photos directly to the user's camera roll.

## Setup (requires Xcode)

1. Open Xcode
2. Create new project: File → New → Project → App
   - Product Name: StudioRelay
   - Team: Your Apple ID
   - Bundle ID: com.studiorelay.app
3. Add App Clip target: File → New → Target → App Clip
   - Product Name: StudioRelayClip
   - Bundle ID: com.studiorelay.app.Clip
4. Copy the Swift files from this directory into the App Clip target
5. Add Associated Domains entitlement to the App Clip target:
   - appclips:yourdomain.com (or your local IP for testing)
6. Build and run on your iPhone

## Testing without domain setup

For local testing, you can use the _XCAppClipURL environment variable:
1. Edit scheme → Run → Arguments → Environment Variables
2. Add: _XCAppClipURL = http://192.168.x.x:3100/dl/{token}

## How it works

1. User scans QR code → iOS launches the App Clip
2. App Clip calls GET /dl/{token}/api to get photo URLs
3. Shows photo grid with "Save All to Photos" button
4. Uses PHPhotoLibrary to save directly to camera roll
