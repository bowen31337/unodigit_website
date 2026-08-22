#!/usr/bin/env python3
"""
The UTM link matrix — one row per marketing asset.

WHY A SCRIPT AND NOT A SPREADSHEET
Every QR code, every button and every printed URL in this folder is generated
from this table. A tagged link that exists only in someone's clipboard drifts:
you get `utm_source=LinkedIn` on one asset and `linkedin` on another, and GA4
reports them as two channels forever. Generating them makes the convention
mechanical.

CONVENTIONS (pick one and never deviate — UTM values are case-sensitive)
  utm_source   WHERE the click came from: the platform. Always lowercase.
  utm_medium   HOW it travelled: the vehicle, not the platform.
               `qr` for anything scanned off a physical surface, `profile`
               for a static bio/banner link, `social` for a post, `signature`
               for email.  Keep `qr` distinct from `social` — scan traffic
               behaves nothing like feed traffic and you want to segment it.
  utm_campaign SHORT. Every character here becomes QR modules; a long campaign
               name pushes the symbol up a version, which means smaller
               modules and a worse scan at distance. `brand26` not
               `brand-awareness-campaign-2026`.
  utm_content  WHICH asset. This is what tells you the roller banner
               outperformed the flyer.
"""
from urllib.parse import urlencode
import json, pathlib

# www, NOT the apex. Verified 2026-08-22: `dig unodigit.com.au` returns no A
# and no CNAME record at all, and curl to https://unodigit.com.au/ fails to
# connect outright (exit 6, HTTP 000). Only www.unodigit.com.au resolves, to
# uno-digit.pages.dev. DNS for this domain is hosted at OnlyDomains rather than
# Cloudflare, which is why the apex was never given an ALIAS/flattened record.
#
# This is not a style preference. A QR encoding the apex is a printed dead end,
# and there is no way to fix 500 flyers after the fact. If an apex record is
# ever added, this can go back — but re-run verify_artwork.py either way.
BASE = "https://www.unodigit.com.au"
CAMPAIGN = "brand26"

# (slug, landing path, source, medium, content, human label)
ASSETS = [
    # ── LinkedIn ────────────────────────────────────────────────────────────
    ("linkedin-company-banner", "/",         "linkedin",  "profile",   "company-banner",  "LinkedIn company page banner (1128x191)"),
    ("linkedin-personal-cover", "/",         "linkedin",  "profile",   "personal-cover",  "LinkedIn personal cover (1584x396)"),
    ("linkedin-post",           "/services/","linkedin",  "social",    "post-card",       "LinkedIn feed post (1200x627)"),
    ("linkedin-doc",            "/insights/","linkedin",  "social",    "carousel",        "LinkedIn document carousel (1080x1080)"),
    # ── WeChat 微信 ──────────────────────────────────────────────────────────
    ("wechat-official-cover",   "/",         "wechat",    "social",    "official-cover",  "WeChat Official Account cover (900x383)"),
    ("wechat-moments",          "/",         "wechat",    "social",    "moments",         "WeChat Moments card (1080x1080)"),
    ("wechat-namecard",         "/contact/", "wechat",    "qr",        "namecard",        "WeChat digital name card (1080x1920)"),
    # ── Other social ────────────────────────────────────────────────────────
    ("x-header",                "/",         "x",         "profile",   "header",          "X / Twitter header (1500x500)"),
    ("instagram-post",          "/",         "instagram", "social",    "post",            "Instagram post (1080x1080)"),
    ("instagram-story",         "/contact/", "instagram", "social",    "story",           "Instagram story (1080x1920)"),
    ("facebook-cover",          "/",         "facebook",  "profile",   "cover",           "Facebook page cover (1640x664)"),
    ("youtube-banner",          "/",         "youtube",   "profile",   "banner",          "YouTube channel art (2560x1440)"),
    ("email-signature",         "/",         "email",     "signature", "sig",             "Email signature block"),
    # ── Print / physical ────────────────────────────────────────────────────
    ("roller-banner",           "/contact/", "print",     "qr",        "roller-banner",   "Pull-up roller banner (850x2000mm)"),
    ("business-card",           "/contact/", "print",     "qr",        "business-card",   "Business card reverse (90x55mm)"),
    ("a4-flyer",                "/services/","print",     "qr",        "a4-flyer",        "A4 leave-behind flyer"),
    ("tradeshow",               "/contact/", "print",     "qr",        "tradeshow",       "Trade-show standee / lectern"),
]


def tagged(path: str, source: str, medium: str, content: str) -> str:
    # Ordered dict, not a plain dict literal shuffled by chance: a stable
    # parameter order means the same asset always produces a byte-identical
    # URL, so the QR PNG only changes when the link genuinely changes.
    q = urlencode([
        ("utm_source", source),
        ("utm_medium", medium),
        ("utm_campaign", CAMPAIGN),
        ("utm_content", content),
    ])
    return f"{BASE}{path}?{q}"


def build():
    rows = []
    for slug, path, src, med, content, label in ASSETS:
        url = tagged(path, src, med, content)
        rows.append({
            "slug": slug, "label": label, "landing": path,
            "utm_source": src, "utm_medium": med,
            "utm_campaign": CAMPAIGN, "utm_content": content,
            "url": url, "url_length": len(url),
        })
    return rows


if __name__ == "__main__":
    rows = build()
    out = pathlib.Path(__file__).parent
    (out / "links.json").write_text(json.dumps(rows, indent=2) + "\n")

    md = ["# UTM link matrix — campaign `%s`\n" % CAMPAIGN,
          "Generated by `links.py`. Do not hand-edit.\n",
          "| Asset | source | medium | content | Tagged URL | len |",
          "|---|---|---|---|---|---|"]
    for r in rows:
        md.append("| %s | `%s` | `%s` | `%s` | `%s` | %d |" % (
            r["label"], r["utm_source"], r["utm_medium"], r["utm_content"],
            r["url"], r["url_length"]))
    (out / "links.md").write_text("\n".join(md) + "\n")
    print(f"{len(rows)} assets, longest URL {max(r['url_length'] for r in rows)} chars")
