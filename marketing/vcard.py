#!/usr/bin/env python3
"""
vCard payloads for staff cards.

WHY vCard 3.0 AND NOT 4.0
3.0 is what phone address books actually implement. iOS and Android both parse
4.0 unevenly, and a contact card that imports with a blank job title on half of
the phones it meets is worse than one that is a version behind.

WHY THE POSTAL ADDRESS IS OMITTED
Two reasons, and the second is the real one. It costs ~40 characters, which on
this payload is the difference between a version-16 and a version-18 symbol —
smaller modules on a fixed 85mm card. And Uno Digit publishes no street
address anywhere (lib/site.ts omits it deliberately), so an ADR line could only
say "Sydney, NSW", which is already printed on the card and adds nothing to a
contact record.

WHY THE PHONE IS E.164
`+61430830888`, not `0430 830 888`. A leading-zero national number saved from a
card handed to someone roaming, or stored on a phone with a non-AU SIM, does
not dial. The card PRINTS the readable grouping and the QR ENCODES E.164 — the
human and the machine want different formats and there is no reason to make
either compromise.
"""
from __future__ import annotations
import json, pathlib
from urllib.parse import urlencode

ROOT = pathlib.Path(__file__).resolve().parent
STAFF = json.loads((ROOT / "staff.json").read_text())["people"]
BASE = "https://www.unodigit.com.au"
CAMPAIGN = "brand26"


def person(slug: str) -> dict:
    for p in STAFF:
        if p["slug"] == slug:
            return p
    raise KeyError(f"no such person: {slug}")


def tagged_url(slug: str) -> str:
    return f"{BASE}/?" + urlencode([
        ("utm_source", "print"), ("utm_medium", "qr"),
        ("utm_campaign", CAMPAIGN), ("utm_content", slug)])


def payload(slug: str) -> str:
    """The vCard a phone sees when it scans the card.

    CRLF line endings are not optional — RFC 6350 requires them and some
    address books silently truncate the record at the first bare LF, which
    shows up as a contact with a name and nothing else.
    """
    p = person(slug)
    lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        f'N:{p["family"]};{p["given"]};;;',
        f'FN:{p["name"]}',
        "ORG:Uno Digit",
        f'TITLE:{p["title"]}',
        f'EMAIL;TYPE=WORK:{p["email"]}',
        f'TEL;TYPE=CELL:{p["phoneE164"]}',
        f"URL:{tagged_url(slug)}",
        "END:VCARD",
        "",
    ]
    return "\r\n".join(lines)


if __name__ == "__main__":
    for p in STAFF:
        v = payload(p["slug"])
        print(f'{p["slug"]}: {len(v)} chars')
        print(v.replace("\r\n", "\n"))
