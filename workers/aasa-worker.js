addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  // Apple App Site Association file
  if (url.pathname === '/.well-known/apple-app-site-association') {
    return new Response(JSON.stringify({
      appclips: { apps: ['UBH8A2T2G2.com.studiorelay.app.Clip'] },
      webcredentials: { apps: ['UBH8A2T2G2.com.studiorelay.app.Clip'] }
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    });
  }

  // Download page — served from Cloudflare (HTTPS) so Web Share API works
  // Photos are fetched from the local server via the ?server= param
  if (url.pathname.startsWith('/dl/')) {
    const server = url.searchParams.get('server');
    const token = url.pathname.split('/')[2];

    if (!server || !token) {
      return new Response(noServerPage(), { headers: { 'Content-Type': 'text/html' } });
    }

    const localBase = 'http://' + server;

    // Fetch photo list from local server API
    let photos = [];
    let eventName = 'StudioRelay';
    try {
      const apiResp = await fetch(localBase + '/dl/' + token + '/api');
      if (apiResp.ok) {
        const data = await apiResp.json();
        photos = data.photos || [];
        eventName = data.eventName || 'StudioRelay';
      }
    } catch (e) {
      // Can't reach local server — show connection instructions
      return new Response(cantConnectPage(server), { headers: { 'Content-Type': 'text/html' } });
    }

    return new Response(downloadPage(eventName, photos, localBase, token), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Everything else passes through to origin (AWS StageRelay app)
  return fetch(request);
}

function downloadPage(eventName, photos, localBase, token) {
  const photoUrls = photos.map(p => localBase + p.full);
  const thumbGrid = photos.map((p, i) =>
    '<div class="thumb"><img src="' + localBase + p.thumbnail + '" alt="Photo ' + (i+1) + '" crossorigin="anonymous"></div>'
  ).join('');

  return '<!DOCTYPE html><html><head>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + eventName + '</title>' +
    '<style>' +
    '* { margin: 0; padding: 0; box-sizing: border-box; }' +
    'body { font-family: -apple-system, system-ui, sans-serif; background: #0a0a0a; color: #f0f0f0; padding: 20px 20px 100px; }' +
    '.brand { text-align: center; font-size: 10px; font-weight: 300; letter-spacing: 0.2em; text-transform: uppercase; color: #333; margin: 16px 0 24px; }' +
    'h1 { font-size: 20px; font-weight: 300; letter-spacing: -0.01em; text-align: center; margin-bottom: 4px; }' +
    '.subtitle { text-align: center; color: #555; font-size: 13px; font-weight: 300; margin-bottom: 24px; }' +
    '.save-btn { display: block; width: 100%; padding: 18px; background: #4353FF; color: #fff; text-align: center; border: none; font-size: 15px; font-weight: 400; font-family: inherit; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; margin-bottom: 8px; border-radius: 0; }' +
    '.save-btn:active { opacity: 0.8; }' +
    '.save-btn:disabled { opacity: 0.4; }' +
    '.status { text-align: center; color: #555; font-size: 12px; font-weight: 300; min-height: 18px; margin-bottom: 20px; }' +
    '.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; }' +
    '.thumb img { width: 100%; display: block; aspect-ratio: 3/2; object-fit: cover; }' +
    '.footer { text-align: center; margin-top: 24px; color: #1a1a1a; font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 300; }' +
    '</style></head><body>' +
    '<p class="brand">' + eventName + '</p>' +
    '<h1>Your photos</h1>' +
    '<p class="subtitle">' + photos.length + ' photo' + (photos.length !== 1 ? 's' : '') + '</p>' +
    '<button class="save-btn" id="saveBtn">Save All to Photos</button>' +
    '<p class="status" id="status"></p>' +
    '<div class="grid">' + thumbGrid + '</div>' +
    '<p class="footer">StudioRelay</p>' +
    '<script>' +
    'var photoUrls = ' + JSON.stringify(photoUrls) + ';' +
    'var zipUrl = "' + localBase + '/dl/' + token + '/zip";' +
    'var btn = document.getElementById("saveBtn");' +
    'var status = document.getElementById("status");' +
    'btn.addEventListener("click", async function() {' +
    '  btn.disabled = true;' +
    '  try {' +
    '    var files = [];' +
    '    for (var i = 0; i < photoUrls.length; i++) {' +
    '      status.textContent = "Loading " + (i+1) + " of " + photoUrls.length + "...";' +
    '      var res = await fetch(photoUrls[i], {mode:"cors"});' +
    '      var blob = await res.blob();' +
    '      files.push(new File([blob], "StudioRelay_" + (i+1) + ".jpg", {type:"image/jpeg"}));' +
    '    }' +
    '    if (navigator.canShare && navigator.canShare({files: files})) {' +
    '      status.textContent = "Choose Save Images below";' +
    '      await navigator.share({files: files});' +
    '      status.textContent = "Done!";' +
    '      btn.textContent = "Saved";' +
    '      return;' +
    '    }' +
    '    status.textContent = "Downloading...";' +
    '    window.location.href = zipUrl;' +
    '    status.textContent = "Check your Downloads";' +
    '  } catch(err) {' +
    '    if (err.name === "AbortError") { status.textContent = "Tap again to retry"; }' +
    '    else { status.textContent = "Downloading..."; window.location.href = zipUrl; }' +
    '  }' +
    '  btn.disabled = false;' +
    '});' +
    '</script></body></html>';
}

function cantConnectPage(server) {
  return '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>StudioRelay</title>' +
    '<style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#f0f0f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}h2{font-weight:300;font-size:20px;margin-bottom:12px}p{color:#666;font-size:13px;font-weight:300;max-width:280px;line-height:1.6}</style>' +
    '</head><body><div><h2>Can\'t reach photo server</h2><p>Make sure you\'re connected to the event WiFi network, then try scanning the QR code again.</p></div></body></html>';
}

function noServerPage() {
  return '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>StudioRelay</title>' +
    '<style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#f0f0f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}h2{font-weight:300;font-size:20px}p{color:#666;font-size:13px;font-weight:300;max-width:280px}</style>' +
    '</head><body><div><h2>StudioRelay</h2><p>Connect to the event WiFi and scan the QR code at the photo station.</p></div></body></html>';
}
