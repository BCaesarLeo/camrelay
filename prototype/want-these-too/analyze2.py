# Cleaner comparison. Two faces in the SAME photo are certainly different people, so
# same-photo pairs are a label-free set of "must not match" pairs (and hard ones: relatives).
import json, os, collections
import numpy as np, cv2
HERE = os.path.dirname(os.path.abspath(__file__))
meta = json.load(open(f"{HERE}/out/faces.json")); data = np.load(f"{HERE}/out/faces.npz")
faces, crops = meta["faces"], data["crops"]
for f in faces: f["session"] = str(f["session"])
N = len(faces)
photo = np.unique([f["photo"] for f in faces], return_inverse=True)[1]
sess = np.unique([f["tab"] + "#" + f["session"] for f in faces], return_inverse=True)[1]
tab = np.array([f["tab"] for f in faces])
same_photo = photo[:, None] == photo[None, :]
same_sess_other_photo = (sess[:, None] == sess[None, :]) & ~same_photo
diff_sess = sess[:, None] != sess[None, :]
iu = np.triu(np.ones((N, N), bool), 1)
has_mates = same_sess_other_photo.any(axis=1)
rng = np.random.default_rng(7)

def sheet(pairs, sims, path, per_row=6):
    rows = []
    for r in range(0, len(pairs), per_row):
        cells = []
        for (a, b), s in zip(pairs[r:r + per_row], sims[r:r + per_row]):
            cell = cv2.copyMakeBorder(np.hstack([crops[a], crops[b]]), 0, 22, 0, 8, cv2.BORDER_CONSTANT, value=(20, 20, 20))
            cv2.putText(cell, f"{faces[a]['tab']}#{faces[a]['session']} / {faces[b]['tab']}#{faces[b]['session']}  {s:.2f}", (2, 128), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (230, 230, 230), 1, cv2.LINE_AA)
            cells.append(cell)
        while len(cells) < per_row: cells.append(np.zeros_like(cells[0]))
        rows.append(np.hstack(cells))
    if rows: cv2.imwrite(path, np.vstack(rows))

for name, label in (("sface", "YuNet + SFace"), ("facenet", "YuNet + FaceNet512")):
    S = data[name] @ data[name].T
    imp = S[same_photo & iu]                       # certain non-matches
    pos = np.where(same_sess_other_photo, S, -1).max(axis=1)[has_mates]
    print("=" * 6, label, "=" * 6, f"({imp.size} certain different-person pairs)")
    for fmr in (0.001, 0.01):
        t = float(np.quantile(imp, 1 - fmr))
        # event-wide consequence: how many OTHER sessions does a face get linked to?
        linked = np.array([len(set(sess[(S[i] >= t) & diff_sess[i]])) for i in range(N)])
        print(f"  threshold {t:.3f} (wrongly matches {fmr*100:g}% of different people in the same photo):")
        print(f"     same person found again in their own session: {100*np.mean(pos >= t):.1f}%")
        print(f"     faces linked to some other session: {100*np.mean(linked > 0):.1f}%   (average other sessions linked per face: {linked.mean():.2f})")
        if fmr == 0.001:
            T = t
    # Random sample of cross-session matches just above the working threshold, for eyeballing
    cand = np.argwhere(diff_sess & iu & (S >= T))
    pick = cand[rng.choice(len(cand), size=min(36, len(cand)), replace=False)]
    sims = [float(S[a, b]) for a, b in pick]
    order = np.argsort(sims)[::-1]
    sheet([tuple(pick[i]) for i in order], [sims[i] for i in order], f"{HERE}/out/{name}_random_cross_session.png")
    print(f"  cross-session face pairs at the stricter threshold: {len(cand)} (36 random ones saved for checking)")
    np.save(f"{HERE}/out/{name}_T.npy", np.array([T]))
