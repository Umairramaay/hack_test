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

Reply with ONLY a JSON object, no other text:
{{
  "min_eur": number,       // lowest typical price found
  "max_eur": number,       // highest typical price found
  "typical_eur": number,   // most common price
  "summary": string        // one short sentence in plain English, e.g. "Most private labs in Lisbon charge €20–€35."
}}
Round to whole euros. If you cannot find prices, give your best estimate
for Portugal and say so in summary."""


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


async def estimate_price(label: str, services: list[str]) -> dict:
    key = f"{label}|{','.join(sorted(services))}".lower()
    if key in _cache:
        return _cache[key]

    services_line = f"Covers these components: {', '.join(services)}\n" if services else ""
    client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""), timeout=90.0)
    resp = await client.responses.create(
        model=os.environ.get("OPENAI_MODEL", "gpt-5.6-luna"),
        tools=[{"type": "web_search_preview"}],
        input=_PROMPT.format(label=label, services_line=services_line),
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
    }
    logger.info("[PRICE] %s → €%s–€%s (%d sources)", label, result["min_eur"], result["max_eur"], len(result["sources"]))
    _cache[key] = result
    return result
