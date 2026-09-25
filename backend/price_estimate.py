import json
import logging
import os
import re

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# Estimates don't change between clicks in a demo session; avoid paying twice.
_cache: dict[str, dict] = {}

_PROMPT = """You estimate what a medical service costs in Portugal.

Service: {label}
{services_line}
Search the web for current private-sector prices in Portugal (clinics,
labs, hospitals such as CUF, Lusíadas, Luz Saúde, Unilabs, Synlab,
Germano de Sousa, Joaquim Chaves) for this service, paid without
insurance. Use several sources.

{network_block}
Reply with ONLY a JSON object, no other text:
{{
  "min_eur": number,       // lowest typical price found
  "max_eur": number,       // highest typical price found
  "typical_eur": number,   // most common price
  "summary": string,       // one short sentence in plain English, e.g. "Most private labs in Lisbon charge €20–€35."
  "clinics": [             // 3 to 5 clinics offering this service
    {{
      "name": string,
      "price_eur": number or null,
      "in_network": "yes" | "no" | "unknown",
      "network_source_url": string or null   // page showing the network status
    }}
  ]
}}
Round to whole euros. If you cannot find prices, give your best estimate
for Portugal and say so in summary."""

_NETWORK_BLOCK = """
The user is insured with {insurer}. For each clinic, check whether it is
part of the {insurer} provider network (e.g. the insurer's "rede de
prestadores" / "rede médica", or the clinic's list of accepted
insurers / "acordos" / "convenções"). Say "yes" or "no" only if a page
states it; otherwise "unknown". Never guess.
"""

_NETWORK_VALUES = {"yes", "no", "unknown"}


def _parse_json(text: str) -> dict:
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise ValueError(f"no JSON in model output: {text[:200]}")
    return json.loads(match.group(0))


def _sources(resp) -> list[dict]:
    seen, out = set(), []
    for item in resp.output or []:
        if getattr(item, "type", None) != "message":
            continue
        for part in item.content or []:
            for ann in getattr(part, "annotations", None) or []:
                url = getattr(ann, "url", None)
                if url and url not in seen:
                    seen.add(url)
                    out.append({"title": getattr(ann, "title", None) or url, "url": url})
    return out[:5]


def _clinics(raw) -> list[dict]:
    out = []
    for c in raw if isinstance(raw, list) else []:
        if not isinstance(c, dict) or not c.get("name"):
            continue
        status = str(c.get("in_network", "unknown")).lower()
        price = c.get("price_eur")
        out.append({
            "name": c["name"],
            "price_eur": round(float(price)) if isinstance(price, (int, float)) else None,
            "in_network": status if status in _NETWORK_VALUES else "unknown",
            "network_source_url": c.get("network_source_url") or None,
        })
    return out[:5]


async def estimate_price(label: str, services: list[str], insurer: str = "") -> dict:
    key = f"{label}|{','.join(sorted(services))}|{insurer}".lower()
    if key in _cache:
        return _cache[key]

    services_line = f"Covers these components: {', '.join(services)}\n" if services else ""
    network_block = _NETWORK_BLOCK.format(insurer=insurer) if insurer else ""
    client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""), timeout=90.0)
    resp = await client.responses.create(
        model=os.environ.get("OPENAI_MODEL", "gpt-5.6-luna"),
        tools=[{"type": "web_search_preview"}],
        input=_PROMPT.format(label=label, services_line=services_line, network_block=network_block),
    )
    data = _parse_json(resp.output_text or "")
    lo, hi = float(data["min_eur"]), float(data["max_eur"])
    result = {
        "min_eur": round(min(lo, hi)),
        "max_eur": round(max(lo, hi)),
        "typical_eur": round(float(data["typical_eur"])) if data.get("typical_eur") is not None else None,
        # Web search inlines citations like "([site](url))"; sources are shown separately.
        "summary": re.sub(r"\s*\(?\[[^\]]*\]\([^)]*\)\)?", "", data.get("summary", "")).strip(),
        "sources": _sources(resp),
        "clinics": _clinics(data.get("clinics")),
    }
    logger.info("[PRICE] %s → €%s–€%s (%d sources)", label, result["min_eur"], result["max_eur"], len(result["sources"]))
    _cache[key] = result
    return result
