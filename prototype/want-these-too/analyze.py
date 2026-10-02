# Compare the two stacks using what we know for free about the Easter event:
#  - photos in the same session are (mostly) the same family   -> should match
#  - people in a different seating (9:30 / 1:00 / 4:00) are other families -> should NOT match
import json, os, collections
import numpy as np, cv2
HERE = os.path.dirname(os.path.abspath(__file__))
meta = json.load(open(f"{HERE}/out/faces.json"))
data = np.load(f"{HERE}/out/faces.npz")
faces, crops = meta["faces"], data["crops"]
for f in faces: f["session"] = str(f["session"])
N = len(faces)
photo_ids = sorted({f["photo"] for f in faces})
pidx = {p: i for i, p in enumerate(photo_ids)}
photo = np.array([pidx[f["photo"]] for f in faces])
sess_keys = sorted({(f["tab"], f["session"]) for f in faces})
sidx = {k: i for i, k in enumerate(sess_keys)}
sess = np.array([sidx[(f["tab"], f["session"])] for f in faces])
tab = np.array([f["tab"] for f in faces])
width = np.array([f["w"] for f in faces])
photo_sess = {pidx[f["photo"]]: sidx[(f["tab"], f["session"])] for f in faces}
photos_in_sess = collections.Counter(photo_sess.values())

same_photo = photo[:, None] == photo[None, :]
same_sess = (sess[:, None] == sess[None, :]) & ~same_photo
other_tab = tab[:, None] != tab[None, :]
same_tab_other_sess = (~other_tab) & (sess[:, None] != sess[None, :])
has_mates = same_sess.any(axis=1)

def sheet(pairs, sims, path, per_row=6):
    rows = []
    for r in range(0, len(pairs), per_row):
        cells = []
        for (a, b), s in zip(pairs[r:r + per_row], sims[r:r + per_row]):
            cell = np.hstack([crops[a], crops[b]])
            cell = cv2.copyMakeBorder(cell, 0, 22, 0, 8, cv2.BORDER_CONSTANT, value=(20, 20, 20))
            label = f"{faces[a]['tab']}#{faces[a]['session']} / {faces[b]['tab']}#{faces[b]['session']}  {s:.2f}"
            cv2.putText(cell, label, (2, 128), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (230, 230, 230), 1, cv2.LINE_AA)
            cells.append(cell)
        while len(cells) < per_row:
            cells.append(np.zeros_like(cells[0]))
        rows.append(np.hstack(cells))
    if rows:
        cv2.imwrite(path, np.vstack(rows))

def top_pairs(S, mask, k, lo=None, hi=None):
    M = np.where(np.triu(mask, 1), S, -1)
    if hi is not None: M = np.where(M <= hi, M, -1)
    order = np.argsort(M, axis=None)[::-1]
    out, sims, used = [], [], set()
    for flat in order:
        a, b = divmod(int(flat), N)
        if M[a, b] < (lo if lo is not None else -0.5): break
        key = (min(sess[a], sess[b]), max(sess[a], sess[b]))
        if key in used: continue  # one example per pair of sessions
        used.add(key); out.append((a, b)); sims.append(float(M[a, b]))
        if len(out) == k: break
    return out, sims

print(f"{N} faces in {len(photo_ids)} photos, {len(sess_keys)} sessions; {int(has_mates.sum())} faces have another photo in their session to match against\n")
report = {}
for name in ("sface", "facenet"):
    E = data[name]
    S = E @ E.T
    pos = np.where(same_sess, S, -1).max(axis=1)[has_mates]
    neg = np.where(other_tab, S, -1).max(axis=1)
    out = {}
    print("=" * 8, "YuNet +", {"sface": "SFace", "facenet": "FaceNet512"}[name], "=" * 8)
    print(f"  best same-session match beats best other-seating match for {100*np.mean(pos > neg[has_mates]):.1f}% of faces")
    for label, q in (("1%", 0.99), ("5%", 0.95)):
        t = float(np.quantile(neg, q))
        rec = float(np.mean(pos >= t))
        out[label] = (t, rec)
        print(f"  threshold {t:.3f} (only {label} of faces match anyone in another seating): finds the same person elsewhere in their session for {100*rec:.1f}% of faces")
    t = out["1%"][0]
    w = width[has_mates]
    for lo, hi in ((36, 60), (60, 100), (100, 9999)):
        m = (w >= lo) & (w < hi)
        print(f"    faces {lo}-{hi if hi < 9999 else '+'}px wide: {100*np.mean(pos[m] >= t):.0f}% found  (n={int(m.sum())})")

    # What the kiosk would actually do: open a session, suggest every other photo sharing a face with it.
    hit = S >= t
    P = len(photo_ids)
    link = np.zeros((P, P), bool)
    a, b = np.nonzero(hit & ~same_photo)
    link[photo[a], photo[b]] = True
    ps = np.array([photo_sess[i] for i in range(P)])
    ptab = np.array([sess_keys[s][0] for s in ps])
    rec, wrong_tab, extra_same_tab = [], [], []
    for s in range(len(sess_keys)):
        members = np.nonzero(ps == s)[0]
        if len(members) < 2: continue
        suggested = link[members].any(axis=0)
        # for each photo in the session: is it reachable from the *other* photos of that session?
        for m in members:
            others = members[members != m]
            rec.append(bool(link[others][:, m].any()))
        outside = suggested & (ps != s)
        wrong_tab.append(int((outside & (ptab != sess_keys[s][0])).sum()))
        extra_same_tab.append(int((outside & (ptab == sess_keys[s][0])).sum()))
    print(f"  per session at that threshold: {100*np.mean(rec):.1f}% of a session's photos are tied to the rest of the session by a face")
    print(f"    suggested photos from a different seating (wrong by construction): {np.mean(wrong_tab):.2f} per session; {100*np.mean(np.array(wrong_tab) == 0):.0f}% of sessions get none")
    print(f"    suggested photos from other sessions in the same seating ('want these too?'): {np.mean(extra_same_tab):.2f} per session; {100*np.mean(np.array(extra_same_tab) > 0):.0f}% of sessions get at least one")
    pairs, sims = top_pairs(S, same_tab_other_sess, 30)
    sheet(pairs, sims, f"{HERE}/out/{name}_cross_session_top.png")
    pairs, sims = top_pairs(S, same_tab_other_sess, 30, lo=t, hi=t + 0.04)
    sheet(pairs, sims, f"{HERE}/out/{name}_cross_session_borderline.png")
    pairs, sims = top_pairs(S, other_tab, 24)
    sheet(pairs, sims, f"{HERE}/out/{name}_other_seating_top.png")
    report[name] = {"t": t}
    print()
t = meta["timing"]
print(f"speed on this Mac: detect {t['detect_per_photo_ms']:.0f} ms/photo, SFace {t['sface_per_face_ms']:.1f} ms/face, FaceNet512 {t['facenet_per_face_ms']:.1f} ms/face; {meta['no_face']} photos had no detectable face")
