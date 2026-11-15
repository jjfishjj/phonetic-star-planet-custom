#!/usr/bin/env python3
"""Safely backfill the four optional VARK cues onto existing advanced cards.

Dry-run is the default. Credentials are read only from PHONETIC_ADMIN_EMAIL and
PHONETIC_ADMIN_PASSWORD; snapshots must stay outside the public repository.
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
DECKS = ("en", "es", "fr", "de", "pt", "it", "ja", "ko")
EXPECTED_TOTAL = 1576
VARK_FIELDS = ("cue_visual", "cue_auditory", "cue_read_write", "cue_kinesthetic")
PRESERVE_FIELDS = (
    "id", "deck_id", "legacy_index", "word", "roman", "hint", "meaning", "cue",
    "position", "published", "topic", "difficulty", "created_at", "proficiency_level",
    "example_sentence", "example_translation",
)
SOURCE_FIELDS = (
    "word", "roman", "hint", "meaning", "cue", "topic", "difficulty",
    "proficiency_level", "example_sentence", "example_translation",
)


def request(base: str, path: str, headers: dict, body: object | None = None) -> object:
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(base + path, data=data, headers=headers, method="GET" if body is None else "POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            details = json.load(error)
            message = str(details.get("message", details.get("code", "request rejected")))[:300]
        except Exception:
            message = "request rejected"
        raise RuntimeError(f"HTTP {error.code}: {message}; inspect live data before retrying") from None
    except Exception as error:
        raise RuntimeError(f"{type(error).__name__}: result may be unknown; inspect live data before retrying") from None


def config_and_auth() -> tuple[str, str, dict]:
    config = (ROOT / "supabase-config.js").read_text(encoding="utf-8")
    base_match = re.search(r"supabaseUrl:\s*'([^']+)'", config)
    key_match = re.search(r"supabaseAnonKey:\s*'([^']+)'", config)
    email, password = os.environ.get("PHONETIC_ADMIN_EMAIL"), os.environ.get("PHONETIC_ADMIN_PASSWORD")
    if not base_match or not key_match:
        raise ValueError("Supabase public configuration is missing")
    if not email or not password:
        raise ValueError("Set PHONETIC_ADMIN_EMAIL and PHONETIC_ADMIN_PASSWORD in the environment")
    base, anon_key = base_match.group(1), key_match.group(1)
    headers = {"apikey": anon_key, "Content-Type": "application/json", "Accept": "application/json"}
    session = request(base, "/auth/v1/token?grant_type=password", headers, {"email": email, "password": password})
    if not isinstance(session, dict) or not session.get("access_token"):
        raise RuntimeError("Administrator sign-in did not return a session")
    headers["Authorization"] = "Bearer " + session["access_token"]
    if request(base, "/rest/v1/rpc/phonetic_is_admin", headers, {}) is not True:
        raise RuntimeError("Saved Supabase identity is not an authorized project administrator")
    return base, anon_key, headers


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
    for deck_id in DECKS:
        data = json.loads((ROOT / "content" / "advanced" / f"{deck_id}.json").read_text(encoding="utf-8"))
        if data.get("deck_id") != deck_id or not isinstance(data.get("cards"), list):
            raise ValueError(f"Invalid advanced content source for {deck_id}")
        for card in data["cards"]:
            if any(not isinstance(card.get(key), str) or not card[key].strip() for key in (*SOURCE_FIELDS, *VARK_FIELDS) if key != "difficulty"):
                raise ValueError(f"Blank or invalid source field: {deck_id} {card.get('word', '')!r}")
            if type(card.get("difficulty")) is not int:
                raise ValueError(f"Invalid difficulty: {deck_id} {card.get('word', '')!r}")
        sources[deck_id] = data["cards"]
    return sources


def verify_snapshot(path: Path, live: list[dict]) -> int:
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    old_cards = snapshot.get("cards") if isinstance(snapshot, dict) else None
    if not isinstance(old_cards, list) or len(old_cards) != EXPECTED_TOTAL:
        raise ValueError(f"Private baseline must contain exactly {EXPECTED_TOTAL} full cards")
    old_by_id = {row.get("id"): row for row in old_cards if isinstance(row, dict)}
    live_by_id = {row.get("id"): row for row in live if isinstance(row, dict)}
    if len(old_by_id) != len(old_cards) or None in old_by_id or len(live_by_id) != len(live):
        raise ValueError("Snapshot or live rows contain missing/duplicate IDs")
    if set(old_by_id) != set(live_by_id):
        raise ValueError("Live card IDs differ from the saved baseline; no cues were updated")
    for card_id, old in old_by_id.items():
        current = live_by_id[card_id]
        for field in PRESERVE_FIELDS:
            if field not in old or current.get(field) != old[field]:
                raise ValueError(f"Existing card field {field} changed for {card_id}; no cues were updated")
    return len(old_cards)


def snapshot(path: Path, cards: list[dict]) -> None:
    if path.resolve().is_relative_to(ROOT.resolve()):
        raise ValueError("Private snapshot path must be outside the public repository")
    if path.exists():
        raise ValueError("Snapshot already exists; choose a new private path rather than overwriting a baseline")
    if len(cards) != EXPECTED_TOTAL or not cards:
        raise ValueError(f"Expected exactly {EXPECTED_TOTAL} live cards; found {len(cards)}")
    if any(not all(field in card for field in (*PRESERVE_FIELDS, *VARK_FIELDS)) for card in cards):
        raise ValueError("Live rows do not expose all VARK columns; apply migration 006 first")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"cards": cards}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    path.chmod(0o600)


def plan_updates(live: list[dict], sources: dict[str, list[dict]]) -> tuple[dict[str, list[dict]], dict[str, int]]:
    by_key = {(row.get("deck_id"), row.get("word")): row for row in live}
    updates: dict[str, list[dict]] = {}
    already: dict[str, int] = {}
    for deck_id, cards in sources.items():
        deck_updates, exact = [], 0
        for source in cards:
            current = by_key.get((deck_id, source["word"]))
            if current is None:
                raise ValueError(f"Advanced card missing in live database: {deck_id} {source['word']!r}")
            if any(current.get(field) != source[field] for field in SOURCE_FIELDS):
                raise ValueError(f"Existing non-VARK content differs; refusing to overwrite: {deck_id} {source['word']!r}")
            changed = [field for field in VARK_FIELDS if (current.get(field) or "") != source[field]]
            conflicts = [field for field in changed if current.get(field) not in (None, "")]
            if conflicts:
                raise ValueError(f"Non-empty VARK content differs for {deck_id} {source['word']!r}: {', '.join(conflicts)}; no cues were updated")
            if not changed:
                exact += 1
                continue
            # The RPC updates only the named cues; all ordinary content and progress remain untouched.
            deck_updates.append({"id": current["id"], "word": current["word"], "hint": current["hint"], "meaning": current["meaning"], **{field: source[field] for field in VARK_FIELDS}})
        updates[deck_id], already[deck_id] = deck_updates, exact
    return updates, already


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, help="save a private full live snapshot after migration; does not write database rows")
    parser.add_argument("--baseline", type=Path, help="private full snapshot captured after migration 006 and before cue backfill")
    parser.add_argument("--apply", action="store_true", help="apply planned updates; dry-run is default")
    args = parser.parse_args()
    if bool(args.snapshot) == bool(args.baseline):
        raise ValueError("Provide exactly one of --snapshot or --baseline")
    if args.apply and args.snapshot:
        raise ValueError("--snapshot is read-only and cannot be combined with --apply")

    base, _anon_key, headers = config_and_auth()
    print("Authorized administrator confirmed; session remains in memory only.", flush=True)
    live = read_all(base, headers)
    if len(live) != EXPECTED_TOTAL:
        raise ValueError(f"Expected {EXPECTED_TOTAL} live cards, found {len(live)}")
    if args.snapshot:
        snapshot(args.snapshot, live)
        print(f"Saved private snapshot of {len(live)} cards to {args.snapshot}; keep it outside the public repository.")
        return

    baseline_count = verify_snapshot(args.baseline, live)
    sources = load_sources()
    updates, already = plan_updates(live, sources)
    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "baseline_cards_verified": baseline_count,
        "planned_updates_per_deck": {deck: {"update": len(updates[deck]), "already_exact": already[deck]} for deck in DECKS},
        "planned_total": sum(len(rows) for rows in updates.values()),
        "preserved": ["IDs", "progress keys", "ordinary cue", "position", "published", "topic", "difficulty", "levels", "examples"],
    }, ensure_ascii=False), flush=True)
    if not args.apply:
        return

    outcomes = []
    for deck_id in DECKS:
        rows = updates[deck_id]
        if not rows:
            outcomes.append({"deck": deck_id, "updated": 0})
            continue
        result = request(base, "/rest/v1/rpc/phonetic_import_cards", headers,
                         {"p_deck_id": deck_id, "p_rows": rows, "p_update_existing": True})
        if result != {"inserted": 0, "updated": len(rows)}:
            raise RuntimeError(f"Unexpected result for {deck_id}: {result!r}; inspect live data before retrying")
        outcomes.append({"deck": deck_id, "updated": len(rows)})
        print(f"{deck_id}: updated {len(rows)} VARK cue sets; all other card fields preserved.", flush=True)

    after = read_all(base, headers)
    verify_snapshot(args.baseline, after)
    by_key = {(row.get("deck_id"), row.get("word")): row for row in after}
    for deck_id, cards in sources.items():
        for source in cards:
            current = by_key[(deck_id, source["word"])]
            if any(current.get(field) != source[field] for field in (*SOURCE_FIELDS, *VARK_FIELDS)):
                raise RuntimeError(f"Post-update verification failed for {deck_id} {source['word']!r}")
    print(json.dumps({"result": "verified", "total_cards": len(after), "advanced_cards": sum(len(v) for v in sources.values()), "decks": outcomes}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"STOP: {error}", file=sys.stderr)
        raise SystemExit(1)
