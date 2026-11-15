#!/usr/bin/env python3
"""Safely append reviewed advanced vocabulary through the authorized admin RPC.

Credentials are read only from PHONETIC_ADMIN_EMAIL / PHONETIC_ADMIN_PASSWORD;
never put them in files, command output, or version control. Dry-run is default.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE_FIELDS = (
    "id", "deck_id", "legacy_index", "word", "roman", "hint", "meaning",
    "cue", "position", "published", "topic", "difficulty", "created_at",
    "proficiency_level", "example_sentence", "example_translation",
)
ADVANCED_DECKS = ("en", "es", "fr", "de", "pt", "it", "ja", "ko")
EXPECTED_SOURCE_COUNTS = {"en": 48, "es": 48, "fr": 48, "de": 48, "pt": 48, "it": 48, "ja": 40, "ko": 48}
EXPECTED_TOTAL_CARDS = 1576
SOURCE_FIELDS = (
    "word", "roman", "hint", "meaning", "cue", "topic", "difficulty",
    "proficiency_level", "example_sentence", "example_translation",
)


def request(base: str, path: str, headers: dict, body: object | None = None) -> object:
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        base + path,
        data=data,
        headers=headers,
        method="GET" if body is None else "POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            details = json.load(error)
            message = str(details.get("message", details.get("code", "request rejected")))[:300]
        except Exception:
            message = "request rejected"
        raise RuntimeError(f"HTTP {error.code}: {message}; stop and inspect before retrying") from None
    except Exception as error:
        raise RuntimeError(f"{type(error).__name__}: result may be unknown; inspect live data before retrying") from None


def read_all(base: str, headers: dict) -> list[dict]:
    rows: list[dict] = []
    while True:
        params = urllib.parse.urlencode({"select": "*", "order": "id.asc", "limit": 1000, "offset": len(rows)})
        page = request(base, "/rest/v1/phonetic_cards?" + params, headers)
        if not isinstance(page, list):
            raise RuntimeError("Unexpected card list response")
        rows.extend(page)
        if len(page) < 1000:
            return rows


def load_sources() -> dict[str, list[dict]]:
    sources = {}
    for deck_id in ADVANCED_DECKS:
        path = ROOT / "content" / "advanced" / f"{deck_id}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("deck_id") != deck_id or not isinstance(data.get("cards"), list):
            raise ValueError(f"invalid advanced content source: {path}")
        cards = data["cards"]
        if len(cards) != EXPECTED_SOURCE_COUNTS[deck_id]:
            raise ValueError(f"{path}: unexpected card count {len(cards)}")
        for card in cards:
            if set(card) != set(SOURCE_FIELDS):
                raise ValueError(f"{path}: card has missing or extra fields")
            if any(not isinstance(card.get(k), str) or not card[k].strip() for k in SOURCE_FIELDS if k != "difficulty"):
                raise ValueError(f"{path}: blank or invalid card field")
            if type(card["difficulty"]) is not int or card["difficulty"] != 3:
                raise ValueError(f"{path}: difficulty must be 3")
        sources[deck_id] = cards
    return sources


def check_originals(baseline_path: Path, live_cards: list[dict]) -> int:
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    old_cards = baseline.get("cards")
    if not isinstance(old_cards, list) or not old_cards:
        raise ValueError("baseline must be a non-empty full public card snapshot")
    baseline_by_id = {row.get("id"): row for row in old_cards if isinstance(row, dict)}
    if len(baseline_by_id) != len(old_cards) or None in baseline_by_id:
        raise ValueError("baseline contains missing or duplicate card ids")
    live_by_id = {row["id"]: row for row in live_cards}
    if len(live_by_id) != len(live_cards):
        raise ValueError("duplicate live card ids")
    for old in old_cards:
        current = live_by_id.get(old["id"])
        if current is None:
            raise ValueError(f"original card missing since snapshot: {old['id']}")
        for field in BASE_FIELDS:
            if field in old and current.get(field) != old[field]:
                raise ValueError(f"original card field {field} changed for {old['id']}; no new cards imported")
    return len(old_cards)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", required=True, type=Path, help="verified full public card snapshot matching the current live database")
    parser.add_argument("--apply", action="store_true", help="perform writes; otherwise only authenticate and report the plan")
    args = parser.parse_args()
    config = (ROOT / "supabase-config.js").read_text(encoding="utf-8")
    base_match = re.search(r"supabaseUrl:\s*'([^']+)'", config)
    key_match = re.search(r"supabaseAnonKey:\s*'([^']+)'", config)
    if not base_match or not key_match:
        raise ValueError("Supabase public configuration is missing")
    base, anon_key = base_match.group(1), key_match.group(1)
    email = os.environ.get("PHONETIC_ADMIN_EMAIL")
    password = os.environ.get("PHONETIC_ADMIN_PASSWORD")
    if not email or not password:
        raise ValueError("Set PHONETIC_ADMIN_EMAIL and PHONETIC_ADMIN_PASSWORD in the environment")

    sources = load_sources()
    headers = {"apikey": anon_key, "Content-Type": "application/json", "Accept": "application/json"}
    session = request(base, "/auth/v1/token?grant_type=password", headers, {"email": email, "password": password})
    if not isinstance(session, dict) or not session.get("access_token"):
        raise RuntimeError("Administrator sign-in did not return a session")
    headers["Authorization"] = "Bearer " + session["access_token"]
    if request(base, "/rest/v1/rpc/phonetic_is_admin", headers, {}) is not True:
        raise RuntimeError("Saved Supabase identity is not an authorized project administrator")
    print("Authorized administrator confirmed; session will remain only in memory.", flush=True)

    live = read_all(base, headers)
    original_count = check_originals(args.baseline, live)
    if len(live) != original_count:
        raise ValueError(f"expected exactly {original_count} live cards before importing; found {len(live)}")
    live_by_deck_word = {(c["deck_id"], c["word"]): c for c in live}
    plan: dict[str, list[dict]] = {}
    already = {}
    for deck_id, cards in sources.items():
        missing = []
        matches = 0
        for source in cards:
            existing = live_by_deck_word.get((deck_id, source["word"]))
            if existing is None:
                missing.append({**source, "published": True})
                continue
            if any(existing.get(field) != source[field] for field in SOURCE_FIELDS):
                raise ValueError(f"Existing card conflicts with proposed source: {deck_id} {source['word']!r}")
            matches += 1
        plan[deck_id] = missing
        already[deck_id] = matches
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "original_cards_verified": original_count,
                      "plan_per_deck": {k: {"insert": len(v), "already_exact": already[k]} for k, v in plan.items()},
                      "planned_total": sum(map(len, plan.values()))}, ensure_ascii=False), flush=True)
    if not args.apply:
        return

    outcomes = []
    for deck_id in ADVANCED_DECKS:
        rows = plan[deck_id]
        if not rows:
            outcomes.append({"deck": deck_id, "inserted": 0, "updated": 0, "already_exact": already[deck_id]})
            continue
        outcome = request(base, "/rest/v1/rpc/phonetic_import_cards", headers,
                          {"p_deck_id": deck_id, "p_rows": rows, "p_update_existing": False})
        if outcome != {"inserted": len(rows), "updated": 0}:
            raise RuntimeError(f"Unexpected import result for {deck_id}: {outcome!r}; stop and inspect live data")
        outcomes.append({"deck": deck_id, **outcome, "already_exact": already[deck_id]})
        print(f"{deck_id}: inserted {len(rows)} cards; original cards unchanged.", flush=True)

    after = read_all(base, headers)
    check_originals(args.baseline, after)
    if len(after) != EXPECTED_TOTAL_CARDS:
        raise RuntimeError(f"Expected {EXPECTED_TOTAL_CARDS:,} total cards after import; found {len(after)}")
    after_by_deck_word = {(c["deck_id"], c["word"]): c for c in after}
    for deck_id, cards in sources.items():
        for source in cards:
            current = after_by_deck_word.get((deck_id, source["word"]))
            if current is None or any(current.get(field) != source[field] for field in SOURCE_FIELDS):
                raise RuntimeError(f"Post-import verification failed for {deck_id} {source['word']!r}")
    print(json.dumps({"result": "verified", "total_cards": len(after), "original_cards_preserved": original_count,
                      "advanced_inserted": sum(x["inserted"] for x in outcomes), "decks": outcomes}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"STOP: {error}", file=sys.stderr)
        raise SystemExit(1)
