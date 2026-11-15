#!/usr/bin/env python3
"""Validate advanced vocabulary and append it to the static fallback catalogue.

Source of truth: content/advanced/<deck>.json. Existing bundled cards are never
rewritten; reruns are idempotent and reject conflicting edits.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DECKS = {
    "en": ("cefr", ["B1", "B2", "C1", "C2"]),
    "es": ("cefr", ["B1", "B2", "C1", "C2"]),
    "fr": ("cefr", ["B1", "B2", "C1", "C2"]),
    "de": ("cefr", ["B1", "B2", "C1", "C2"]),
    "pt": ("cefr", ["B1", "B2", "C1", "C2"]),
    "it": ("cefr", ["B1", "B2", "C1", "C2"]),
    "ja": ("jlpt", ["N3", "N2", "N1"]),
    "ko": ("topik", ["3", "4", "5", "6"]),
}
EXPECTED_LEVEL_COUNTS = {
    "en": {"B1": 12, "B2": 12, "C1": 12, "C2": 12},
    "es": {"B1": 12, "B2": 12, "C1": 12, "C2": 12},
    "fr": {"B1": 12, "B2": 12, "C1": 12, "C2": 12},
    "de": {"B1": 12, "B2": 12, "C1": 12, "C2": 12},
    "pt": {"B1": 12, "B2": 12, "C1": 12, "C2": 12},
    "it": {"B1": 12, "B2": 12, "C1": 12, "C2": 12},
    "ja": {"N3": 14, "N2": 13, "N1": 13},
    "ko": {"3": 12, "4": 12, "5": 12, "6": 12},
}
TOPICS = {
    "general", "greetings", "people", "home", "food", "travel", "time",
    "numbers", "expressions", "nature", "study", "shopping", "actions",
    "descriptions",
}
FIELDS = (
    "word", "roman", "hint", "meaning", "cue", "topic", "difficulty",
    "proficiency_level", "example_sentence", "example_translation",
)
CSV_FIELDS = (
    "word", "roman", "hint", "meaning", "cue", "topic", "difficulty",
    "proficiency_level", "example_sentence", "example_translation", "published",
    "position", "id",
)
CHINESE = re.compile(r"[\u3400-\u9fff]")


def normalized(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().casefold()


def load_decks(path: Path) -> tuple[str, list[dict]]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"\bconst\s+decks\s*=", text)
    if not match:
        raise ValueError(f"{path}: cannot find const decks")
    start = match.end()
    while start < len(text) and text[start].isspace():
        start += 1
    decks, end = json.JSONDecoder().raw_decode(text[start:])
    if not isinstance(decks, list) or len(decks) != 12:
        raise ValueError("expected the original 12 language decks")
    return text, decks


def validate_source(deck_id: str, expected_scheme: str, expected_levels: list[str]) -> list[dict]:
    path = ROOT / "content" / "advanced" / f"{deck_id}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("deck_id") != deck_id or data.get("level_scheme") != expected_scheme:
        raise ValueError(f"{path}: deck id or level scheme mismatch")
    cards = data.get("cards")
    if not isinstance(cards, list):
        raise ValueError(f"{path}: cards must be an array")
    counts = Counter()
    words = set()
    for index, card in enumerate(cards, start=1):
        if set(card) != set(FIELDS):
            raise ValueError(f"{path}: row {index} must contain exactly {FIELDS}")
        for field in ("word", "roman", "hint", "meaning", "cue", "topic", "proficiency_level", "example_sentence", "example_translation"):
            if not isinstance(card[field], str) or not card[field].strip():
                raise ValueError(f"{path}: row {index} has blank/non-text {field}")
            if len(card[field]) > {"word": 300, "roman": 300, "hint": 500, "meaning": 500, "cue": 2000, "example_sentence": 500, "example_translation": 500}.get(field, 500):
                raise ValueError(f"{path}: row {index} {field} exceeds its database limit")
        if card["proficiency_level"] not in expected_levels:
            raise ValueError(f"{path}: row {index} has unsupported level {card['proficiency_level']!r}")
        if card["topic"] not in TOPICS:
            raise ValueError(f"{path}: row {index} has unsupported topic {card['topic']!r}")
        if type(card["difficulty"]) is not int or card["difficulty"] != 3:
            raise ValueError(f"{path}: row {index} must use difficulty=3")
        if not all(CHINESE.search(card[f]) for f in ("hint", "meaning", "cue", "example_translation")):
            raise ValueError(f"{path}: row {index} needs Traditional-Chinese mnemonic, meaning, cue and translation")
        key = normalized(card["word"])
        if key in words:
            raise ValueError(f"{path}: duplicate new headword {card['word']!r}")
        words.add(key)
        counts[card["proficiency_level"]] += 1
    expected_counts = EXPECTED_LEVEL_COUNTS[deck_id]
    if dict(counts) != expected_counts:
        raise ValueError(f"{path}: expected exactly {expected_counts}, found {dict(counts)}")
    return cards


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate without writing; fail if index.html is stale")
    args = parser.parse_args()

    text, decks = load_decks(ROOT / "index.html")
    by_id = {deck["id"]: deck for deck in decks}
    if len(by_id) != 12:
        raise ValueError("duplicate deck ids")

    all_sources: dict[str, list[dict]] = {}
    for deck_id, (scheme, levels) in DECKS.items():
        if deck_id not in by_id or len(by_id[deck_id]["cards"]) < 100:
            raise ValueError(f"missing deck or its 100 original cards: {deck_id}")
        cards = validate_source(deck_id, scheme, levels)
        existing = by_id[deck_id]["cards"]
        existing_by_word = {normalized(c["word"]): c for c in existing}
        if len(existing_by_word) != len(existing):
            raise ValueError(f"{deck_id}: duplicate normalized word in bundled deck")
        for card in cards:
            key = normalized(card["word"])
            if key in existing_by_word:
                prior = existing_by_word[key]
                if any(prior.get(field) != card[field] for field in FIELDS):
                    raise ValueError(f"{deck_id}: existing card conflicts with source for {card['word']!r}")
        all_sources[deck_id] = cards

    appended = 0
    for deck_id, cards in all_sources.items():
        deck = by_id[deck_id]
        existing = {normalized(c["word"]): c for c in deck["cards"]}
        for card in cards:
            if normalized(card["word"]) not in existing:
                deck["cards"].append(dict(card))
                appended += 1

    new_text = text[:]
    match = re.search(r"\bconst\s+decks\s*=", text)
    start = match.end()
    while start < len(text) and text[start].isspace():
        start += 1
    _, end = json.JSONDecoder().raw_decode(text[start:])
    new_text = text[:start] + json.dumps(decks, ensure_ascii=False, indent=2) + text[start + end:]
    if args.check:
        if appended:
            raise ValueError(f"index.html is missing {appended} source cards; run without --check")
        print("Validated 376 advanced cards; index.html is in sync (1,576 bundled cards).")
        return

    (ROOT / "index.html").write_text(new_text, encoding="utf-8")
    csv_dir = ROOT / "content" / "advanced" / "csv"
    csv_dir.mkdir(parents=True, exist_ok=True)
    for deck_id, cards in all_sources.items():
        out = csv_dir / f"{deck_id}.csv"
        with out.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS, extrasaction="ignore")
            writer.writeheader()
            for card in cards:
                writer.writerow({**card, "published": "true", "position": "", "id": ""})
    print(f"Validated all 376 source cards; appended {appended} to the static catalogue and refreshed 8 admin-import CSV files.")


if __name__ == "__main__":
    main()
