#!/usr/bin/env python3
"""Face service for the kiosk: finds faces with YuNet and describes each with SFace.

The kiosk (Node) starts this as a child process and talks to it over localhost.
It only ever answers "which faces are in this file"; matching is done in the kiosk.

    POST /embed   {"path": "/abs/photo.jpg"}  ->  {"faces": [{"box": [x,y,w,h], "score": s, "emb": [128 floats]}], "ms": 23}
    GET  /health                              ->  {"ok": true}

Same steps and settings as the Easter trial (prototype/want-these-too/extract.py), so the
thresholds found there still apply.
"""
import json, os, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "..", "assets", "face")
PORT = int(os.environ.get("FACE_PORT", "3101"))
MIN_SCORE, MIN_FACE, MAX_SIDE = 0.8, 36, 2048  # as in the trial: faces >= 36 px wide on a 2048 px copy

detector = cv2.FaceDetectorYN.create(os.path.join(MODELS, "yunet.onnx"), "", (320, 320), MIN_SCORE, 0.3, 5000)
sface = cv2.FaceRecognizerSF.create(os.path.join(MODELS, "sface.onnx"), "")
lock = __import__("threading").Lock()


def embed(path: str):
    img = cv2.imread(path)
    if img is None:
        raise ValueError("could not read image")
    s = MAX_SIDE / max(img.shape[:2])
    if s < 1:
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    out = []
    with lock:  # the OpenCV objects are not thread-safe
        detector.setInputSize((img.shape[1], img.shape[0]))
        _, found = detector.detect(img)
        for f in (found if found is not None else []):
            if f[2] < MIN_FACE:
                continue
            aligned = sface.alignCrop(img, f)
            emb = sface.feature(aligned).flatten()
            emb = emb / (np.linalg.norm(emb) or 1.0)
            out.append({
                "box": [round(float(v) / s if s < 1 else float(v), 1) for v in f[:4]],
                "score": round(float(f[14]), 3),
                "emb": [round(float(v), 5) for v in emb],
            })
    return out


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):  # quiet; the kiosk logs what matters
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/embed":
            return self._send(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n) or b"{}")
            t0 = time.time()
            faces = embed(req["path"])
            self._send(200, {"faces": faces, "ms": round(1000 * (time.time() - t0))})
        except Exception as e:  # one bad photo must not take the service down
            self._send(500, {"error": str(e)[:300]})


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"face service on 127.0.0.1:{PORT}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
