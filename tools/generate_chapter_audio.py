import argparse
import asyncio
import json
import re
import sys
from pathlib import Path


DATA_JS = Path("doc-truyen-vip/data.js")
OUT_DIR = Path("doc-truyen-vip/audio")
DEFAULT_VOICE = "vi-VN-HoaiMyNeural"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def log(message):
    print(str(message).encode("utf-8", errors="replace").decode("utf-8", errors="replace"))


def load_data():
    raw = DATA_JS.read_text(encoding="utf-8")
    match = re.match(r"\s*window\.STORY_DATA\s*=\s*(.*);\s*$", raw, re.S)
    if not match:
        raise ValueError(f"Cannot parse {DATA_JS}")
    return json.loads(match.group(1))


def chapter_text(chapter):
    paragraphs = [str(item).strip() for item in chapter.get("body", []) if str(item).strip()]
    return "\n\n".join(paragraphs)


async def generate_mp3(edge_tts, text, voice, output):
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output))


async def main():
    parser = argparse.ArgumentParser(description="Generate MP3 audio files for story chapters.")
    parser.add_argument("--chapter", help="Chapter id to generate, for example c001.")
    parser.add_argument("--all", action="store_true", help="Generate every chapter.")
    parser.add_argument("--limit", type=int, default=0, help="Generate at most N chapters.")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help="Edge TTS voice name.")
    parser.add_argument("--overwrite", action="store_true", help="Regenerate existing MP3 files.")
    args = parser.parse_args()

    if not args.all and not args.chapter:
        parser.error("Use --chapter c001 or --all.")

    try:
        import edge_tts
    except ImportError as exc:
        raise SystemExit(
            "Missing edge-tts. Install it with: python -m pip install edge-tts"
        ) from exc

    data = load_data()
    chapters = []
    for story in data.get("stories", []):
        for chapter in story.get("chapters", []):
            if args.all or chapter.get("id") == args.chapter:
                chapters.append((story, chapter))

    if args.limit:
        chapters = chapters[: args.limit]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for story, chapter in chapters:
        chapter_id = chapter["id"]
        output = OUT_DIR / f"{chapter_id}.mp3"
        if output.exists() and not args.overwrite:
            log(f"skip {chapter_id}: {output}")
        else:
            text = chapter_text(chapter)
            log(f"generate {chapter_id}: {chapter['title']}")
            await generate_mp3(edge_tts, text, args.voice, output)
        manifest.append(
            {
                "storyId": story["id"],
                "chapterId": chapter_id,
                "title": chapter["title"],
                "audioUrl": f"audio/{chapter_id}.mp3",
            }
        )

    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    log(f"Done. Generated/checked {len(chapters)} chapter audio files.")
    log("Run tools/build_doc_truyen_data.py after generating audio to attach audioUrl fields.")


if __name__ == "__main__":
    asyncio.run(main())
