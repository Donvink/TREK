"""Check copyable venture application fields against the supplied form limits.

Run from any directory. This validates text consistency and character limits;
it does not verify business claims, market estimates or competition eligibility.
"""

from pathlib import Path
import json
import re
import sys


BASE = Path(__file__).resolve().parent
LABELS = {
    "description": "Describe your startup (not confidential)",
    "innovation": "Innovation (confidential)",
    "technology": "Technology & Product (confidential)",
    "team": "Team (confidential)",
    "market": "Market (confidential)",
    "impact": "Sustainability & Impact (confidential)",
    "business": "Business (confidential)",
}
EXPECTED_LIMITS = {
    "description": [100, 500],
    "innovation": [500, 1500],
    "technology": [500, 1500],
    "team": [500, 1500],
    "market": [500, 1500],
    "impact": [300, 1500],
    "business": [500, 1500],
}


def main() -> int:
    data = json.loads((BASE / "drafts.json").read_text(encoding="utf-8"))
    errors = []
    placeholders = []
    checked = 0
    if data["limits"] != EXPECTED_LIMITS:
        errors.append("Stored limits differ from the supplied application form")
    ids = [draft["id"] for draft in data["drafts"]]
    if ids != [f"{n:02}" for n in range(1, 11)]:
        errors.append("Expected exactly ten ordered, distinct alternatives")

    for draft in data["drafts"]:
        path = BASE / f"{draft['id']}-{draft['slug']}.md"
        if not path.exists():
            errors.append(f"Missing draft: {path.name}")
            continue
        markdown = path.read_text(encoding="utf-8")
        fields = draft["fields"]
        if set(fields) != set(LABELS):
            errors.append(f"{path.name}: missing or unexpected fields")
            continue
        for key, label in LABELS.items():
            text = fields[key]
            count = len(text.encode("utf-16-le")) // 2
            minimum, maximum = EXPECTED_LIMITS[key]
            checked += 1
            if not minimum <= count <= maximum:
                errors.append(f"{path.name}/{key}: {count} outside limits")
            pattern = (
                r"## " + re.escape(label)
                + r"\n\n字符数：(\d+)｜[^\n]+\n\n```text\n(.*?)\n```"
            )
            match = re.search(pattern, markdown, flags=re.DOTALL)
            if match is None:
                errors.append(f"{path.name}/{key}: copyable block missing")
            else:
                if int(match.group(1)) != count:
                    errors.append(f"{path.name}/{key}: displayed count mismatch")
                if match.group(2) != text:
                    errors.append(f"{path.name}/{key}: Markdown/JSON mismatch")
            unresolved = re.findall(r"\[[A-Z][A-Z ,/()-]*\]", text)
            if unresolved:
                placeholders.append((path.name, key, unresolved))

    for path in BASE.glob("*.md"):
        markdown = path.read_text(encoding="utf-8")
        for target in re.findall(r"\]\(([^)]+)\)", markdown):
            if "://" in target or target.startswith("#"):
                continue
            local = target.split("#", 1)[0]
            if local and not (path.parent / local).exists():
                errors.append(f"{path.name}: broken local link {target}")

    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"PASS: {checked} fields, character limits, displayed counts and local links")
    print(f"Outstanding market placeholders: {len(placeholders)}")
    for filename, key, items in placeholders:
        print(f"- {filename}/{key}: {', '.join(items)}")
    print("Drafts still need a selected concept, verified market size and financial details.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
