import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_JS = ROOT / "doc-truyen-vip" / "data.js"
OUT_SQL = ROOT / "supabase-story-content.sql"
CHUNK_DIR = ROOT / "supabase-story-content-chunks"
CHAPTERS_PER_CHUNK = 25


def sql_string(value):
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def sql_json(value):
    return sql_string(json.dumps(value, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def main():
    raw = DATA_JS.read_text(encoding="utf-8")
    match = re.match(r"\s*window\.STORY_DATA\s*=\s*(.*);\s*$", raw, re.S)
    if not match:
        raise SystemExit("Cannot parse doc-truyen-vip/data.js")

    data = json.loads(match.group(1))
    lines = [
        "begin;",
        "",
        "delete from public.story_chapter_bodies;",
        "delete from public.story_chapters;",
        "delete from public.stories;",
        "",
    ]
    chunk_lines = []
    chunk_index = 1
    chunk_chapters = 0

    CHUNK_DIR.mkdir(exist_ok=True)
    for old_chunk in CHUNK_DIR.glob("*.sql"):
        old_chunk.unlink()

    def flush_chunk():
        nonlocal chunk_index, chunk_chapters, chunk_lines
        if not chunk_lines:
            return
        chunk_path = CHUNK_DIR / f"{chunk_index:03d}.sql"
        chunk_path.write_text("\n".join(["begin;", *chunk_lines, "commit;", ""]), encoding="utf-8")
        chunk_index += 1
        chunk_chapters = 0
        chunk_lines = []

    for story_index, story in enumerate(data.get("stories", []), start=1):
        lines.append(
            "insert into public.stories "
            "(id, title, author, status, genre, cover, summary, updated_at, reads, rating, sort_order, is_active, db_updated_at) "
            "values ("
            f"{sql_string(story['id'])}, "
            f"{sql_string(story.get('title', ''))}, "
            f"{sql_string(story.get('author', ''))}, "
            f"{sql_string(story.get('status', 'Đang ra'))}, "
            f"{sql_json(story.get('genre', []))}, "
            f"{sql_string(story.get('cover'))}, "
            f"{sql_string(story.get('summary'))}, "
            f"{sql_string(story.get('updatedAt'))}, "
            f"{int(story.get('reads') or 0)}, "
            f"{float(story.get('rating') or 0)}, "
            f"{story_index}, true, now()) "
            "on conflict (id) do update set "
            "title = excluded.title, "
            "author = excluded.author, "
            "status = excluded.status, "
            "genre = excluded.genre, "
            "cover = excluded.cover, "
            "summary = excluded.summary, "
            "updated_at = excluded.updated_at, "
            "reads = excluded.reads, "
            "rating = excluded.rating, "
            "sort_order = excluded.sort_order, "
            "is_active = true, "
            "db_updated_at = now();"
        )
        chunk_lines.append(lines[-1])

        for chapter_index, chapter in enumerate(story.get("chapters", []), start=1):
            body = chapter.get("body") or []
            audio_urls = chapter.get("audioUrls") or {}
            audio_url = chapter.get("audioUrl") or chapter.get("audio") or ""
            free = "true" if chapter.get("free", True) is not False else "false"
            price = int(chapter.get("price") or chapter.get("price_coins") or 0)
            episode_title = chapter.get("episodeTitle")

            lines.append(
                "insert into public.story_chapters "
                "(story_id, chapter_id, sort_order, title, episode_title, free, price_coins, audio_url, audio_urls, is_active, db_updated_at) "
                "values ("
                f"{sql_string(story['id'])}, "
                f"{sql_string(chapter['id'])}, "
                f"{chapter_index}, "
                f"{sql_string(chapter.get('title', ''))}, "
                f"{sql_string(episode_title)}, "
                f"{free}, "
                f"{price}, "
                f"{sql_string(audio_url)}, "
                f"{sql_json(audio_urls)}, "
                "true, now()) "
                "on conflict (story_id, chapter_id) do update set "
                "sort_order = excluded.sort_order, "
                "title = excluded.title, "
                "episode_title = excluded.episode_title, "
                "free = excluded.free, "
                "price_coins = excluded.price_coins, "
                "audio_url = excluded.audio_url, "
                "audio_urls = excluded.audio_urls, "
                "is_active = true, "
                "db_updated_at = now();"
            )
            chunk_lines.append(lines[-1])
            lines.append(
                "insert into public.story_chapter_bodies "
                "(story_id, chapter_id, body, db_updated_at) "
                "values ("
                f"{sql_string(story['id'])}, "
                f"{sql_string(chapter['id'])}, "
                f"{sql_json(body)}, "
                "now()) "
                "on conflict (story_id, chapter_id) do update set "
                "body = excluded.body, "
                "db_updated_at = now();"
            )
            chunk_lines.append(lines[-1])
            chunk_chapters += 1
            if chunk_chapters >= CHAPTERS_PER_CHUNK:
                flush_chunk()

    lines.extend(["", "commit;", ""])
    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")
    flush_chunk()
    chapter_count = sum(len(s.get("chapters", [])) for s in data.get("stories", []))
    print(f"Wrote {OUT_SQL} from {chapter_count} chapters")
    print(f"Wrote {chunk_index - 1} chunk files to {CHUNK_DIR}")


if __name__ == "__main__":
    main()
