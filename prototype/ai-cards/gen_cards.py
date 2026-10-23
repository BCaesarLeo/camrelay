#!/usr/bin/env python3
"""Generate themed AI "collectible cards" from event photos with Gemini image models.

    gen_cards.py --theme ancc-halloween --name "The Carter Family" photo.jpg [photo2.jpg ...]

Reads GEMINI_API_KEY from the environment, else from ~/dev/cam/.env.
Outputs land in out/<theme>/<photo-stem>.png next to a .txt with the prompt used.
"""
import argparse, os, re, sys, time, json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"

THEMES = {
    # Army Navy Country Club — Halloween 2026
    "ancc-halloween": {
        "crest": HERE / "assets" / "ancc-crest.png",
        "colors": "deep navy blue (#093C6D) and antique gold (#D4BA81)",
        "event_text": "ANCC HALLOWEEN 2026",
        "scene": (
            "a festive Halloween evening on the lawn in front of a stately brick country-club clubhouse "
            "with white columns, glowing carved jack-o'-lanterns on the steps, warm string lights, drifting "
            "autumn leaves, a big full moon and a few friendly cartoon bats and ghosts. Cheerful and "
            "family-friendly, never scary or gory."
        ),
        "wardrobe": (
            "dress each person in a fun, tasteful Halloween costume that suits them (for example a pirate, "
            "witch, astronaut, superhero, pumpkin, cat, or vampire), with no masks so faces stay clearly visible"
        ),
    },
}

STYLES = {
    "3d": "a polished 3D animated-movie look (Pixar / Disney style), soft studio lighting, expressive but faithful faces",
    "comic": "a bold modern comic-book illustration with clean ink lines and rich flat colours",
    "watercolor": "a loose, luminous watercolour painting with soft edges and visible paper texture",
}


# A different costume family per card, so a row of cards isn't all pirates
COSTUME_SETS = [
    "classic Halloween: witches, vampires and a friendly skeleton",
    "space: astronauts and a little green alien",
    "superheroes with capes and emblems",
    "a royal court: king, queen, knight and princess",
    "fairy-tale: wizard, fairy, dragon and a unicorn",
    "pirates and a sea captain",
    "farm Halloween: scarecrow, pumpkin and a black cat",
    "retro: 1920s detectives and flappers",
]


def build_prompt(theme: dict, style: str, name: str, costume_set: str | None = None) -> str:
    costume_note = f" — for this card use the costume theme: {costume_set}" if costume_set else ""
    return (
        f"Create a premium collectible trading card illustration, portrait orientation.\n\n"
        f"SUBJECTS: First count the people in the attached photo (ignore any costumed mascot character). "
        f"The card MUST show exactly that many people, every one of them, in the same left-to-right order and "
        f"similar poses, adults and children alike. Do not leave anyone out and do not add anyone. Keep each "
        f"person's face, hairstyle, skin tone, age, glasses, facial hair and expression clearly recognisable so each "
        f"of them can say 'that's me'. Render them in {STYLES[style]}. "
        f"Then {theme['wardrobe']}{costume_note}.\n\n"
        f"Ignore the photo's original backdrop, props and any costumed mascot; replace them completely with "
        f"this scene: {theme['scene']}\n\n"
        f"CARD DESIGN: Frame the artwork as a trading card with a border in {theme['colors']}, with fine gold "
        f"pinstripe trim and subtle foil texture. Place the attached club crest small at the top centre of the "
        f"border, reproduced exactly as supplied. Across the bottom of the card put a gold banner with the name "
        f"\"{name}\" in elegant serif capitals, and below it the smaller text \"{theme['event_text']}\". "
        f"All text must be spelled exactly as written, crisp and perfectly legible.\n\n"
        f"The card fills the whole image edge to edge with no margin around it."
    )


def load_key() -> str:
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if key:
        return key
    env = Path.home() / "dev" / "cam" / ".env"
    if env.exists():
        m = re.search(r"^(?:GEMINI|GOOGLE)_API_KEY=(.+)$", env.read_text(), re.M)
        if m:
            return m.group(1).strip().strip('"')
    sys.exit("No GEMINI_API_KEY in the environment or ~/dev/cam/.env")


def generate(client, model: str, prompt: str, photo: Path, crest: Path | None, size: str, aspect: str):
    from google.genai import types

    parts = [prompt, types.Part.from_bytes(data=photo.read_bytes(), mime_type="image/jpeg")]
    if crest and crest.exists():
        parts.append("Club crest to reproduce on the card:")
        parts.append(types.Part.from_bytes(data=crest.read_bytes(), mime_type="image/png"))
    cfg = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio=aspect, image_size=size),
    )
    t0 = time.time()
    resp = client.models.generate_content(model=model, contents=parts, config=cfg)
    for part in resp.candidates[0].content.parts:
        if part.inline_data and part.inline_data.data:
            return part.inline_data.data, part.inline_data.mime_type, time.time() - t0
    raise RuntimeError(f"no image returned: {resp}")


class QuotaError(RuntimeError):
    """Out of quota / billing not enabled: retrying any photo is pointless until it is fixed."""


def classify(e: Exception) -> str:
    msg = str(e)
    if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower():
        return "quota"
    if any(k in msg for k in ("503", "500", "502", "504", "UNAVAILABLE", "DEADLINE", "timed out", "timeout", "Connection")):
        return "transient"
    if any(k in msg for k in ("SAFETY", "blocked", "no image returned", "PROHIBITED")):
        return "refused"
    return "error"


def generate_with_retry(client, model, prompt, photo, crest, size, aspect, tries=2):
    """One retry for transient trouble; quota errors are raised as QuotaError at once;
    refusals are not retried (the same photo would be refused again)."""
    last = None
    for attempt in range(tries):
        try:
            return generate(client, model, prompt, photo, crest, size, aspect)
        except Exception as e:
            kind = classify(e)
            if kind == "quota":
                raise QuotaError(str(e)[:400]) from e
            if kind != "transient" or attempt == tries - 1:
                raise
            last = e
            time.sleep(5 * (attempt + 1))
    raise last  # unreachable


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photos", nargs="+", type=Path)
    ap.add_argument("--theme", default="ancc-halloween", choices=THEMES)
    ap.add_argument("--style", default="3d", choices=STYLES)
    ap.add_argument("--name", default="The Smith Family", help="name banner text")
    ap.add_argument("--model", default="gemini-3-pro-image-preview")
    ap.add_argument("--size", default="1K", choices=["1K", "2K", "4K"])
    ap.add_argument("--aspect", default="2:3")
    ap.add_argument("--dry-run", action="store_true", help="print the prompt and exit")
    a = ap.parse_args()

    theme = THEMES[a.theme]
    if a.dry_run:
        print(build_prompt(theme, a.style, a.name, COSTUME_SETS[0]))
        return

    from google import genai

    from google.genai import types as gtypes
    client = genai.Client(api_key=load_key(), http_options=gtypes.HttpOptions(timeout=90_000))
    outdir = OUT / a.theme
    outdir.mkdir(parents=True, exist_ok=True)
    log = []
    for n, photo in enumerate(a.photos):
        stem = photo.stem[:12]
        # costume set rotates with the photo's id, so a re-run of the same photo gets the same look
        costume = COSTUME_SETS[sum(photo.stem.encode()) % len(COSTUME_SETS)]
        prompt = build_prompt(theme, a.style, a.name, costume)
        try:
            data, mime, secs = generate_with_retry(client, a.model, prompt, photo, theme["crest"], a.size, a.aspect)
        except QuotaError as e:
            # Billing/quota problems affect every photo: stop the batch rather than burn through it
            print(f"STOPPED on {photo.name}: {e}", file=sys.stderr)
            log.append({"photo": photo.name, "error": "quota", "detail": str(e)[:300]})
            break
        except Exception as e:  # this photo failed; keep going on the rest
            print(f"FAILED {photo.name}: {classify(e)}: {str(e)[:200]}", file=sys.stderr)
            log.append({"photo": photo.name, "error": classify(e), "detail": str(e)[:300]})
            continue
        ext = ".png" if "png" in mime else ".jpg"
        out = outdir / f"{stem}-{a.style}{ext}"
        out.write_bytes(data)
        (outdir / f"{stem}-{a.style}.txt").write_text(f"model={a.model} size={a.size} name={a.name}\n\n{prompt}")
        print(f"{photo.name} -> {out.relative_to(HERE)}  ({secs:.1f}s, {len(data)//1024} KB)")
        log.append({"photo": photo.name, "out": str(out), "seconds": round(secs, 1)})
    (outdir / "run.json").write_text(json.dumps(log, indent=2))


if __name__ == "__main__":
    main()
