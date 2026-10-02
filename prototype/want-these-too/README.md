# "Want these too?" — face-matching trial and selection mockup

Design work for the next version of the kiosk's selection screen. Nothing here is wired into
the kiosk yet.

## What is in git

| File | What it does |
|---|---|
| `download.py` | Pulls an event's photos from the hosted gallery JSON and keeps a 2048px copy of each |
| `extract.py` | Finds faces with YuNet and describes each with SFace and FaceNet512 |
| `analyze.py`, `analyze2.py` | Score the two stacks and build face-pair sheets for checking by eye |
| `mockup_data.py` | Picks real example sessions and works out what the kiosk would suggest |
| `mockup/build.py` | Builds the interactive mockup (`mockup/index.html`) from `mockup/data.json` |

## What is deliberately not in git

Guests' photos, face crops, face prints, the results page and the built mockup. They are
generated on this machine and ignored by `.gitignore`. `mockup/index.html` and
`out/results.html` are kept locally so they can be reopened.

## Result of the trial (Easter 2026, 917 photos, 3,380 faces)

- YuNet + SFace was the better stack. Both stacks re-found a person within their own session
  about 98% of the time; across sessions, a hand check of 36 random matches each gave about 30
  correct for SFace and about 15 for FaceNet512.
- Every error was a baby or toddler. Guard: link two sessions only when two different people
  match, or one matches very strongly, and always let the guest confirm.
- Licences: YuNet is MIT, SFace is Apache 2.0.

## Re-running

Needs Python 3.11 with `numpy pillow opencv-python` (and `deepface tf-keras` for FaceNet512),
plus `models/yunet.onnx` and `models/sface.onnx` from the OpenCV model zoo.

    python download.py && python extract.py && python analyze2.py
    python mockup_data.py && (cd mockup && python build.py)
