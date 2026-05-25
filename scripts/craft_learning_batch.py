from __future__ import annotations

import datetime as dt
import html
import json
import os
import re
import textwrap
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "research"
RUNS = RESEARCH / "learning-runs"
STATE_PATH = RESEARCH / "auto-learning-state.json"

PROJECT_REQUIREMENTS = """
Bạn là phụ tá nghiên cứu và huấn luyện văn phong dài hạn cho tiểu thuyết mạng Việt Nam
"Phế Thổ: Ta Nhặt Được Cả Thế Giới".

Ràng buộc cứng:
- Chỉ học craft từ nguồn công khai hợp pháp.
- Không bypass paywall, không dùng nguồn lậu, không dùng chương khóa.
- Không sao chép văn nguồn, không bắt chước nguyên văn câu chữ, hình ảnh đặc thù,
  đoạn thoại, cảnh nổi tiếng.
- Chỉ rút kỹ thuật: nhịp chương, mở cảnh, đẩy tình tiết, nội tâm, hồi tưởng,
  cao trào, hook cuối chương, xây đồng đội, tình cảm, hy sinh, trả cảm xúc.
- Không viết demo, không viết chương mới, không sửa nội dung truyện chính.
- Không tự nâng version/tag.
- Tất cả ghi chú phải viết tiếng Việt có dấu đầy đủ.

Ưu tiên học tiếp:
1. Slow-burn relationship trong survival fiction: trust ladder, consent, micro-care.
2. Arc ending design: đóng xung đột chính, trả cảm xúc, mở bí mật tuyến lớn.
3. Đối thoại nhiều phe: đàm phán, ép giá, quyền lực mềm, ngôn ngữ thủ tục.
4. Sinh tồn phế thổ: đói, nước, phóng xạ, đồ ăn bẩn, tinh thạch, logistics.
5. Kỳ ngộ không hệ thống/dị năng/tu tiên: may mắn hợp logic, trực giác sinh tồn, vật chứng.
6. Lỗi văn máy cần tránh và cách làm văn người hơn.
"""

SOURCES = [
    {
        "name": "Helping Writers Become Authors - Scene Structure",
        "url": "https://www.helpingwritersbecomeauthors.com/scene-structure/",
        "kind": "craft article",
        "focus": "cấu trúc cảnh Goal-Conflict-Disaster và nhịp sau cảnh",
    },
    {
        "name": "MasterClass - Cliffhanger craft",
        "url": "https://www.masterclass.com/articles/how-to-write-a-cliffhanger-14-tips-for-writing-page-turning-cliffhangers-with-dan-brown-and-rl-stine",
        "kind": "public craft article",
        "focus": "hook cuối chương, suspense, câu hỏi chưa giải",
    },
    {
        "name": "TV Tropes - Apocalyptic Logistics",
        "url": "https://tvtropes.org/pmwiki/pmwiki.php/Main/ApocalypticLogistics",
        "kind": "trope reference",
        "focus": "logic hậu cần sau tận thế: nước, thức ăn, vận chuyển, thuốc",
    },
    {
        "name": "TV Tropes - Scavenger World",
        "url": "https://tvtropes.org/pmwiki/pmwiki.php/Main/ScavengerWorld",
        "kind": "trope reference",
        "focus": "xã hội nhặt rác, giá trị vật tư, luật sống còn",
    },
    {
        "name": "Now Novel - Character development",
        "url": "https://www.nownovel.com/blog/character-development/",
        "kind": "craft article",
        "focus": "nội tâm, biến chuyển nhân vật, vết thương và lựa chọn",
    },
    {
        "name": "Reedsy - Story structure",
        "url": "https://blog.reedsy.com/guide/story-structure/",
        "kind": "craft guide",
        "focus": "nhịp arc, biến cố, cao trào, trả cảm xúc",
    },
]


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"run_count": 0, "sources_seen": {}}


def save_state(state: dict) -> None:
    STATE_PATH.write_text(
        json.dumps(state, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def fetch_public_text(url: str) -> tuple[str, str]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "story-ThanhMV-public-craft-learning/1.0",
            "Accept": "text/html, text/plain;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        raw = resp.read(600_000)
        charset = resp.headers.get_content_charset() or "utf-8"
    page = raw.decode(charset, errors="replace")
    title_match = re.search(r"<title[^>]*>(.*?)</title>", page, flags=re.I | re.S)
    title = clean_text(title_match.group(1)) if title_match else url
    page = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", page, flags=re.I | re.S)
    headings = re.findall(r"<h[1-3][^>]*>(.*?)</h[1-3]>", page, flags=re.I | re.S)
    paragraphs = re.findall(r"<p[^>]*>(.*?)</p>", page, flags=re.I | re.S)
    bits = [clean_text(x) for x in headings[:12] + paragraphs[:24]]
    text = "\n".join(x for x in bits if x)
    return title, text[:9000]


def clean_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def fallback_digest(source: dict, title: str, text: str, error: str | None = None) -> str:
    evidence = textwrap.shorten(text.replace("\n", " "), width=900, placeholder="...")
    status = "Đọc được nguồn công khai." if not error else f"Không đọc được nguồn: {error}"
    return f"""## Batch học tự động

- Nguồn: {source["name"]}
- Link: {source["url"]}
- Loại nguồn: {source["kind"]}
- Trọng tâm học: {source["focus"]}
- Trạng thái: {status}
- Tiêu đề/metadata đọc được: {title}

### Kỹ thuật rút ra
- Mỗi lượt học chỉ ghi craft pattern, không chép văn nguồn.
- Với Phế Thổ, ưu tiên biến kiến thức nguồn thành quy tắc hành động: mở cảnh bằng áp lực sống còn, để vật tư tạo xung đột, kết cảnh bằng một thay đổi có giá.
- Khi không có LLM secret, batch này dùng fallback: đọc tiêu đề/heading/đoạn công khai rồi ghi insight mức khung. Muốn phân tích sâu hơn, thêm GitHub secret `OPENAI_API_KEY`.
- Batch tự động chạy trên GitHub Actions mỗi 30 phút, nên vẫn chạy khi máy local tắt, miễn workflow đang enabled.

### Áp dụng cho Phế Thổ
- Biến `{source["focus"]}` thành checklist khi sửa chương: cảnh phải có mục tiêu cụ thể, cản trở cụ thể, giá phải trả, và hook không dựa vào sao chép nguồn.
- Không viết demo, không viết chương mới, không sửa canon chính.

### Dấu vết đọc công khai
{evidence}
"""


def llm_digest(source: dict, title: str, text: str) -> str | None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    model = os.environ.get("OPENAI_MODEL") or "gpt-4.1-mini"
    prompt = f"""
{PROJECT_REQUIREMENTS}

Nguồn: {source["name"]}
Link: {source["url"]}
Loại: {source["kind"]}
Trọng tâm: {source["focus"]}
Tiêu đề đọc được: {title}

Trích nội dung công khai đã làm sạch, chỉ dùng để phân tích craft:
{text[:7000]}

Hãy trả về tiếng Việt có dấu, dạng markdown ngắn:
- kỹ thuật học được
- áp dụng cho Phế Thổ
- nên cập nhật mục nào trong craft lab/source digest
- lỗi cần tránh
- ghi rõ không chép văn nguồn
"""
    payload = {
        "model": model,
        "input": prompt,
        "max_output_tokens": 1200,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        return fallback_digest(source, title, text, f"OpenAI API lỗi: {exc}")

    chunks: list[str] = []
    for item in data.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                chunks.append(content.get("text", ""))
    return "\n".join(chunks).strip() or None


def append_daily_run(now: dt.datetime, source: dict, digest: str, mode: str) -> Path:
    RUNS.mkdir(parents=True, exist_ok=True)
    path = RUNS / f"{now.strftime('%Y-%m-%d')}.md"
    header = ""
    if not path.exists():
        header = f"# Learning Runs {now.strftime('%Y-%m-%d')}\n\n"
    entry = f"""## {now.strftime('%H:%M:%S UTC')} - {source["name"]}

- Mode: {mode}
- Link: {source["url"]}

{digest.strip()}

---

"""
    path.write_text(header + (path.read_text(encoding="utf-8") if path.exists() else "") + entry, encoding="utf-8")
    return path


def update_learning_state(now: dt.datetime, source: dict, mode: str, run_path: Path) -> None:
    path = RESEARCH / "learning-state.md"
    old = path.read_text(encoding="utf-8") if path.exists() else "# Learning State\n"
    marker = "## Auto Learning Status"
    block = f"""## Auto Learning Status
- Lần chạy gần nhất: {now.strftime('%Y-%m-%d %H:%M:%S UTC')}.
- Lịch GitHub Actions mong muốn: mỗi 30 phút (`*/30 * * * *`), chạy trên GitHub nên không phụ thuộc máy local.
- Nguồn vừa học: {source["name"]} ({source["url"]}).
- Chế độ học: {mode}.
- Ghi chú batch: `{run_path.as_posix()}`.
- Quy tắc: không viết demo, không viết chương mới, không sửa nội dung truyện chính, không chép văn nguồn.
"""
    if marker in old:
        old = old[: old.index(marker)].rstrip() + "\n\n" + block + "\n"
    else:
        old = old.rstrip() + "\n\n" + block + "\n"
    path.write_text(old, encoding="utf-8")


def main() -> None:
    RESEARCH.mkdir(exist_ok=True)
    state = load_state()
    source = SOURCES[state.get("run_count", 0) % len(SOURCES)]
    now = utc_now()
    try:
        title, text = fetch_public_text(source["url"])
        error = None
    except Exception as exc:  # Keep the scheduled flow alive; record the failure.
        title, text, error = source["url"], "", str(exc)

    digest = None if error else llm_digest(source, title, text)
    mode = "llm" if digest and "fallback" not in digest.lower() else "fallback"
    if not digest:
        digest = fallback_digest(source, title, text, error)
        mode = "fallback"

    run_path = append_daily_run(now, source, digest, mode)
    update_learning_state(now, source, mode, run_path)
    state["run_count"] = state.get("run_count", 0) + 1
    state["last_run_utc"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    state["last_source"] = source
    state["last_mode"] = mode
    save_state(state)
    print(f"Craft learning batch recorded in {run_path} ({mode}).")


if __name__ == "__main__":
    main()
