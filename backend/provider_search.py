"""
LLM-powered healthcare provider search.

Uses the same OpenAI Responses API already configured for insurance analysis,
with the web_search_preview tool so results are real and current.
Missing coordinates are filled in concurrently via Nominatim (free, no key).
"""
import asyncio
import json
import logging
import math
import os

import httpx

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL   = os.environ.get("OPENAI_MODEL", "gpt-5.6-luna")
OPENAI_API_URL = "https://api.openai.com/v1/responses"

# Controlled set of service types — must match ITEM_SERVICE_TYPE in ProviderSearch.jsx
VALID_SERVICE_TYPES = frozenset({
    "dental", "blood_test", "diagnostic_imaging", "general_practice",
    "specialist", "vision", "physiotherapy", "mental_health",
    "pharmacy", "vaccination", "other",
})

# Per-service instructions for the LLM
_PROMPTS: dict[str, dict] = {
    "dental": {
        "search_for": "dentists and dental clinics",
        "include":    "dentist, dental clinic, dental centre, orthodontist",
        "exclude":    "general hospital, pharmacy, GP clinic, physiotherapy, laboratory",
        "type_label": "Dental Clinic",
    },
    "blood_test": {
        "search_for": "medical laboratories and diagnostic centres that perform blood tests",
        "include":    "medical laboratory, clinical laboratory, diagnostic laboratory, pathology lab, blood test centre",
        "exclude":    "dentist, pharmacy, physiotherapy, eye clinic, GP-only clinic",
        "type_label": "Medical Laboratory",
    },
    "diagnostic_imaging": {
        "search_for": "diagnostic imaging centres offering X-ray, MRI, CT scan or ultrasound",
        "include":    "diagnostic centre, imaging centre, radiology clinic, MRI centre, X-ray clinic",
        "exclude":    "dentist, pharmacy, GP-only clinic",
        "type_label": "Diagnostic Center",
    },
    "general_practice": {
        "search_for": "GP clinics and family medicine centres",
        "include":    "GP clinic, family doctor, primary care clinic, health centre, medical centre",
        "exclude":    "dentist, pharmacy, optician, physiotherapy, laboratory",
        "type_label": "Medical Clinic",
    },
    "specialist": {
        "search_for": "specialist medical clinics and private specialist doctors",
        "include":    "specialist clinic, private specialist, specialist medical centre",
        "exclude":    "pharmacy, dentist, optician",
        "type_label": "Specialist Clinic",
    },
    "vision": {
        "search_for": "optometrists, opticians and eye clinics",
        "include":    "optometrist, optician, eye clinic, ophthalmology clinic, vision centre",
        "exclude":    "dentist, pharmacy, GP clinic, physiotherapy, laboratory",
        "type_label": "Eye Clinic",
    },
    "physiotherapy": {
        "search_for": "physiotherapy clinics and rehabilitation centres",
        "include":    "physiotherapy clinic, physiotherapist, rehabilitation centre",
        "exclude":    "dentist, pharmacy, GP-only clinic, eye clinic",
        "type_label": "Physiotherapy Clinic",
    },
    "mental_health": {
        "search_for": "psychology and psychiatry clinics",
        "include":    "psychology clinic, psychologist, psychiatrist, mental health clinic",
        "exclude":    "dentist, pharmacy, physiotherapy, laboratory",
        "type_label": "Mental Health Clinic",
    },
    "pharmacy": {
        "search_for": "pharmacies and chemists",
        "include":    "pharmacy, chemist, farmácia",
        "exclude":    "dental clinic, hospital, GP clinic",
        "type_label": "Pharmacy",
    },
    "vaccination": {
        "search_for": "vaccination centres and clinics that offer vaccines",
        "include":    "vaccination centre, travel vaccination clinic, vaccine clinic",
        "exclude":    "dental clinic, laboratory-only",
        "type_label": "Vaccination Centre",
    },
    "other": {
        "search_for": "medical clinics and health centres",
        "include":    "medical clinic, health centre",
        "exclude":    "pharmacy, dental clinic",
        "type_label": "Medical Clinic",
    },
}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2)
    return round(R * 2 * math.asin(math.sqrt(a)), 2)


def _extract_text(raw: dict) -> str:
    """Extract assistant output_text from a Responses API response."""
    for item in raw.get("output", []):
        if item.get("type") == "message" and item.get("role") == "assistant":
            for part in item.get("content", []):
                if part.get("type") == "output_text":
                    text = part.get("text", "")
                    if text:
                        return text
    types = [o.get("type") for o in raw.get("output", [])]
    raise ValueError(f"No assistant text found. Output types: {types}")


def _normalize_hours(raw) -> list | None:
    if raw is None:
        return None
    if isinstance(raw, list):
        parts = [str(h).strip() for h in raw if h]
        return parts or None
    if isinstance(raw, str):
        parts = [s.strip() for s in raw.split(";") if s.strip()]
        return parts or None
    return None


async def _geocode_one(address: str, client: httpx.AsyncClient) -> tuple[float, float] | None:
    """Reverse-geocode an address string via Nominatim (free, no key required)."""
    try:
        resp = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": address, "format": "json", "limit": 1},
            headers={"User-Agent": "InsuranceAnalyzer/1.0 (hackathon)"},
            timeout=6.0,
        )
        if resp.is_success:
            results = resp.json()
            if results:
                return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception:
        pass
    return None


# ─── Main search function ─────────────────────────────────────────────────────

async def search_providers(service_type: str, lat: float, lng: float) -> list[dict]:
    """
    Ask the LLM (with web search) to find real nearby healthcare providers,
    geocode any missing coordinates, compute distances, and return a
    normalised list sorted by distance.
    """
    info = _PROMPTS.get(service_type, _PROMPTS["other"])
    default_type = info["type_label"]

    prompt = (
        f"Search the web for {info['search_for']} near GPS coordinates: "
        f"latitude {lat}, longitude {lng}.\n\n"
        "Return ONLY a valid JSON object — no markdown, no explanation:\n"
        '{\n  "providers": [\n    {\n'
        '      "name": "Provider name",\n'
        f'      "type": "{default_type}",\n'
        '      "address": "Full street address including city",\n'
        '      "latitude": null,\n'
        '      "longitude": null,\n'
        '      "opening_hours": null,\n'
        '      "website": null,\n'
        '      "phone": null\n'
        '    }\n  ]\n}\n\n'
        "Rules:\n"
        f"- Find 5–10 REAL, currently operating providers nearest to those coordinates\n"
        f"- ONLY include: {info['include']}\n"
        f"- DO NOT include: {info['exclude']}\n"
        "- If you know the exact latitude/longitude of a provider, include it; otherwise null\n"
        '- If you know opening hours, format as a JSON list: ["Mo-Fr 09:00-18:00"]; otherwise null\n'
        "- Provide the most specific street address possible including city name"
    )

    payload = {
        "model": OPENAI_MODEL,
        "tools": [{"type": "web_search_preview"}],
        "input": [{"role": "user", "content": [{"type": "input_text", "text": prompt}]}],
        "max_output_tokens": 4096,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            OPENAI_API_URL,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if not resp.is_success:
        raise RuntimeError(
            f"LLM provider search failed ({resp.status_code}): {resp.text[:400]}"
        )

    raw = resp.json()
    logger.info("[PROVIDERS] LLM response_id=%s model=%s", raw.get("id", "?"), raw.get("model", "?"))

    text = _extract_text(raw)

    # Strip markdown code fences if present (web_search mode can't use JSON mode)
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        stripped = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        data = json.loads(stripped)
    except json.JSONDecodeError as e:
        raise ValueError(f"LLM returned invalid JSON: {e} | preview: {stripped[:300]}") from e

    raw_providers: list[dict] = data.get("providers", [])

    # Geocode providers that the LLM didn't give coordinates for
    need_geocode = [
        (i, p) for i, p in enumerate(raw_providers)
        if p.get("latitude") is None and p.get("address")
    ]
    if need_geocode:
        async with httpx.AsyncClient() as geo_client:
            geo_results = await asyncio.gather(
                *[_geocode_one(p["address"], geo_client) for _, p in need_geocode],
                return_exceptions=True,
            )
        for (i, _), coords in zip(need_geocode, geo_results):
            if isinstance(coords, tuple):
                raw_providers[i]["latitude"]  = coords[0]
                raw_providers[i]["longitude"] = coords[1]

    # Normalise + compute distance
    providers: list[dict] = []
    for p in raw_providers:
        name = str(p.get("name") or "").strip()
        if not name:
            continue

        plat = p.get("latitude")
        plng = p.get("longitude")
        try:
            plat = float(plat) if plat is not None else None
            plng = float(plng) if plng is not None else None
        except (TypeError, ValueError):
            plat = plng = None

        distance = (
            _haversine_km(lat, lng, plat, plng)
            if plat is not None and plng is not None
            else None
        )

        providers.append({
            "name":          name,
            "type":          str(p.get("type") or default_type),
            "address":       str(p.get("address") or ""),
            "latitude":      plat,
            "longitude":     plng,
            "distance_km":   distance,
            "opening_hours": _normalize_hours(p.get("opening_hours")),
            "website":       p.get("website") or None,
            "phone":         p.get("phone") or None,
        })

    providers.sort(key=lambda x: x["distance_km"] if x["distance_km"] is not None else 9999)
    return providers[:15]
