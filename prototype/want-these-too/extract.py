# Detect faces with YuNet once, then describe each face with SFace and FaceNet512.
import json, os, sys, time, collections
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
HERE = os.path.dirname(os.path.abspath(__file__))
os.environ["DEEPFACE_HOME"] = HERE
import numpy as np, cv2

MIN_SCORE, MIN_FACE = 0.8, 36  # pixels wide, on the 2048px copy

index = json.load(open(f"{HERE}/index.json"))
# One row per photo. RAW+JPG pairs of the same shot would make matching look easier than it is.
photos, seen_shot = {}, set()
for e in index:
    stem = e["filename"].rsplit(".", 1)[0].lower()
    key = (e["tab"], e["session"])
    if e["id"] in photos:
        continue
    if (key, stem) in seen_shot:
        continue
    seen_shot.add((key, stem))
    if os.path.exists(f"{HERE}/photos/{e['id']}.jpg"):
        photos[e["id"]] = {"tab": e["tab"], "session": e["session"], "filename": e["filename"]}
print("photos to scan:", len(photos), flush=True)

detector = cv2.FaceDetectorYN.create(f"{HERE}/models/yunet.onnx", "", (320, 320), MIN_SCORE, 0.3, 5000)
sface = cv2.FaceRecognizerSF.create(f"{HERE}/models/sface.onnx", "")
from deepface.modules.modeling import build_model
facenet = build_model(task="facial_recognition", model_name="Facenet512").model

def facenet_crop(img, face):
    # DeepFace-style: level the eyes, crop the detector box, pad to a square, 160px
    x, y, w, h = face[:4]
    (rx, ry), (lx, ly) = face[4:6], face[6:8]
    angle = np.degrees(np.arctan2(ly - ry, lx - rx))
    cx, cy = x + w / 2, y + h / 2
    M = cv2.getRotationMatrix2D((float(cx), float(cy)), float(angle), 1.0)
    rot = cv2.warpAffine(img, M, (img.shape[1], img.shape[0]))
    x0, y0, x1, y1 = max(0, int(x)), max(0, int(y)), min(img.shape[1], int(x + w)), min(img.shape[0], int(y + h))
    crop = rot[y0:y1, x0:x1]
    side = max(crop.shape[:2])
    canvas = np.zeros((side, side, 3), np.uint8)
    oy, ox = (side - crop.shape[0]) // 2, (side - crop.shape[1]) // 2
    canvas[oy:oy + crop.shape[0], ox:ox + crop.shape[1]] = crop
    return cv2.resize(canvas, (160, 160))

faces, sf_emb, crops, fn_in = [], [], [], []
t_det = t_sf = 0.0
no_face = 0
for n, (pid, meta) in enumerate(photos.items(), 1):
    img = cv2.imread(f"{HERE}/photos/{pid}.jpg")
    t = time.time()
    detector.setInputSize((img.shape[1], img.shape[0]))
    _, found = detector.detect(img)
    t_det += time.time() - t
    kept = [f for f in (found if found is not None else []) if f[2] >= MIN_FACE]
    if not kept:
        no_face += 1
    for f in kept:
        t = time.time()
        aligned = sface.alignCrop(img, f)
        emb = sface.feature(aligned).flatten()
        t_sf += time.time() - t
        sf_emb.append(emb / np.linalg.norm(emb))
        crops.append(aligned)
        fn_in.append(facenet_crop(img, f))
        faces.append({"photo": pid, "tab": meta["tab"], "session": meta["session"], "w": float(f[2]), "score": float(f[14])})
    if n % 100 == 0:
        print(n, "photos,", len(faces), "faces", flush=True)

# FaceNet512 in batches. DeepFace's default "base" normalisation: BGR pixels / 255.
t = time.time()
batch = np.stack(fn_in).astype("float32") / 255.0
fn_emb = facenet.predict(batch, batch_size=64, verbose=0)
t_fn = time.time() - t
fn_emb = fn_emb / np.linalg.norm(fn_emb, axis=1, keepdims=True)

np.savez(f"{HERE}/out/faces.npz", sface=np.stack(sf_emb), facenet=fn_emb, crops=np.stack(crops))
json.dump({"faces": faces, "photos": photos, "no_face": no_face,
           "timing": {"detect_per_photo_ms": 1000 * t_det / len(photos), "sface_per_face_ms": 1000 * t_sf / len(faces), "facenet_per_face_ms": 1000 * t_fn / len(faces)}},
          open(f"{HERE}/out/faces.json", "w"))
per = collections.Counter(f["photo"] for f in faces)
print(f"done: {len(photos)} photos, {len(faces)} faces, {no_face} photos with no face, median faces/photo {int(np.median(list(per.values())))}")
print(f"timing: detect {1000*t_det/len(photos):.0f} ms/photo, SFace {1000*t_sf/len(faces):.1f} ms/face, FaceNet512 {1000*t_fn/len(faces):.1f} ms/face (batched)")
