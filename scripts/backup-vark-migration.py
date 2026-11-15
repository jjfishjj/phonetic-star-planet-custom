#!/usr/bin/env python3
"""Create a private pre-VARK backup of all Supabase decks and cards.

The default output must remain outside the public repository. Credentials are
read only from PHONETIC_ADMIN_EMAIL / PHONETIC_ADMIN_PASSWORD and held in memory.
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
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_DECKS = 12
EXPECTED_CARDS = 1576


def request(base: str, path: str, headers: dict, body: object | None = None) -> object:
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(base + path, data=data, headers=headers, method="GET" if body is None else "POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            detail = json.load(error)
            reason = str(detail.get("message", detail.get("code", "request rejected")))[:250]
        except Exception:
            reason = "request rejected"
        raise RuntimeError(f"HTTP {error.code}: {reason}") from None
    except Exception as error:
        raise RuntimeError(f"{type(error).__name__}: backup result may be incomplete; inspect before retrying") from None


def fetch_all(base: str, table: str, headers: dict) -> list[dict]:
    rows: list[dict] = []
    while True:
        query = urllib.parse.urlencode({"select": "*", "order": "id.asc", "limit": 1000, "offset": len(rows)})
        page = request(base, f"/rest/v1/{table}?{query}", headers)
        if not isinstance(page, list):
            raise RuntimeError(f"Unexpected response for {table}")
        rows.extend(page)
        if len(page) < 1000:
            return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path, help="private path outside the public repository")
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(ROOT.resolve()):
        raise ValueError("Backup path must be outside the public repository")
    if args.output.exists():
        raise ValueError("Backup already exists; choose a new private output path")
    config = (ROOT / "supabase-config.js").read_text(encoding="utf-8")
    url_match = re.search(r"supabaseUrl:\s*'([^']+)'", config)
    key_match = re.search(r"supabaseAnonKey:\s*'([^']+)'", config)
    email, password = os.environ.get("PHONETIC_ADMIN_EMAIL"), os.environ.get("PHONETIC_ADMIN_PASSWORD")
    if not url_match or not key_match or not email or not password:
        raise ValueError("Supabase configuration or admin credentials are missing")
    base, anon_key = url_match.group(1), key_match.group(1)
    headers = {"apikey": anon_key, "Content-Type": "application/json", "Accept": "application/json"}
    session = request(base, "/auth/v1/token?grant_type=password", headers, {"email": email, "password": password})
    if not isinstance(session, dict) or not session.get("access_token"):
        raise RuntimeError("Administrator authentication did not return a session")
    headers["Authorization"] = "Bearer " + session["access_token"]
    if request(base, "/rest/v1/rpc/phonetic_is_admin", headers, {}) is not True:
        raise RuntimeError("Saved Supabase identity is not an authorized administrator")
    decks = fetch_all(base, "phonetic_decks", headers)
    cards = fetch_all(base, "phonetic_cards", headers)
    if len(decks) != EXPECTED_DECKS or len(cards) != EXPECTED_CARDS:
        raise RuntimeError(f"Expected {EXPECTED_DECKS} decks and {EXPECTED_CARDS} cards; found {len(decks)} and {len(cards)}")
    deck_ids = {d.get("id") for d in decks}
    card_ids = {c.get("id") for c in cards}
    if len(deck_ids) != len(decks) or len(card_ids) != len(cards) or any(c.get("deck_id") not in deck_ids for c in cards):
        raise RuntimeError("Backup data contains duplicate IDs or cards with unknown decks")
    backup = {
        "format": "phonetic-star-planet-pre-vark-backup-v1",
        "captured_at_utc": datetime.now(timezone.utc).isoformat(),
        "project_ref": base.split("//", 1)[-1].split(".", 1)[0],
        "deck_count": len(decks),
        "card_count": len(cards),
        "progress_note": "Learning progress and favorites are browser-localStorage, not stored in Supabase; this schema-only migration does not touch them.",
        "decks": decks,
        "cards": cards,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(backup, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.output.chmod(0o600)
    print(f"Private backup verified: {len(decks)} decks, {len(cards)} cards. Saved to {args.output}; credentials were not stored.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"STOP: {error}", file=sys.stderr)
        raise SystemExit(1)
