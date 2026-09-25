import json
import logging
import os
from pathlib import Path
from typing import Optional

import pdfplumber
from openai import AsyncOpenAI
from pydantic import BaseModel
from rapidfuzz import fuzz

from prompts import COVERAGE_EXTRACTION_PROMPT

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")
DEBUG_EXTRACT = os.environ.get("DEBUG_EXTRACT", "").lower() == "true"

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


# ---------------------------------------------------------------------------
# Pydantic output schema (matches instructions.md OUTPUT SCHEMA, no "verified")
# ---------------------------------------------------------------------------

class _Network(BaseModel):
    type: str
    amount_eur: Optional[float] = None
    pct: Optional[float] = None
    min_eur: Optional[float] = None
    max_eur: Optional[float] = None


class _OutOfNetwork(BaseModel):
    type: str
    pct: Optional[float] = None
    cap_eur: Optional[float] = None


class _CoverageRow(BaseModel):
    service_id: str
    network: _Network
    out_of_network: _OutOfNetwork
    limit_pool: Optional[str] = None
    waiting_days: Optional[int] = None
    deductible: Optional[str] = None
    inherited_from_parent: bool = False
    page: Optional[int] = None
    quote: Optional[str] = None


class _LimitPool(BaseModel):
    id: str
    amount_eur: float
    parent: Optional[str] = None


class _CoverageExtraction(BaseModel):
    insurer: str
    product_as_written: str
    rows: list[_CoverageRow]
    limit_pools: list[_LimitPool]


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------

def pdf_pages(path: str) -> list[dict]:
    """Extract text per page from a PDF. Raises ValueError if no text found."""
    pages = []
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = (page.extract_text() or "").strip()
            pages.append({"page": i, "text": text})

    if not any(p["text"] for p in pages):
        raise ValueError("scanned PDF not supported")
    return pages


def _build_user_content(pages: list[dict]) -> str:
    with open(_DATA_DIR / "services.json") as f:
        services = json.load(f)

    parts = ["SERVICES (service_id and Portuguese labels):"]
    for svc in services:
        parts.append(f'  {svc["service_id"]}: {svc["pt"]}')
    parts.append("")

    for p in pages:
        parts.append(f'PAGE {p["page"]}:')
        parts.append(p["text"] or "(no text)")
        parts.append("")

    return "\n".join(parts)


async def _call_once(user_content: str) -> _CoverageExtraction:
    logger.info("[EXTRACT] Calling model=%s prompt_chars=%d content_chars=%d",
                OPENAI_MODEL, len(COVERAGE_EXTRACTION_PROMPT), len(user_content))
    if DEBUG_EXTRACT:
        logger.debug("[EXTRACT] SYSTEM PROMPT:\n%s", COVERAGE_EXTRACTION_PROMPT)
        logger.debug("[EXTRACT] USER CONTENT:\n%s", user_content)

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    resp = await client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": COVERAGE_EXTRACTION_PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        max_completion_tokens=8192,
    )
    raw_text = resp.choices[0].message.content or "{}"
    if resp.usage:
        logger.info("[EXTRACT] tokens input=%s output=%s total=%s",
                    resp.usage.prompt_tokens, resp.usage.completion_tokens, resp.usage.total_tokens)
    if DEBUG_EXTRACT:
        logger.debug("[EXTRACT] RESPONSE:\n%s", raw_text)

    raw = json.loads(raw_text)
    return _CoverageExtraction.model_validate(raw)


async def extract_coverage(pages: list[dict]) -> tuple[dict, bool]:
    """
    Call OpenAI to extract coverage from PDF pages.
    Returns (coverage_dict, used_demo).
    Falls back to demo_coverage.json on any failure.
    """
    if not pages:
        logger.warning("[EXTRACT] No pages supplied, using demo")
        return _load_demo(), True

    user_content = _build_user_content(pages)

    for attempt in range(2):
        try:
            result = await _call_once(user_content)
            coverage = result.model_dump()
            logger.info("[EXTRACT] Extraction succeeded insurer=%s", coverage.get("insurer"))
            return coverage, False
        except Exception as exc:
            logger.warning("[EXTRACT] Attempt %d failed: %s", attempt + 1, exc)

    logger.warning("[EXTRACT] All attempts failed, using demo")
    return _load_demo(), True


def verify_quotes(rows: list[dict], pages: list[dict]) -> tuple[list[dict], str]:
    """
    For each row with a quote and page number, check the quote appears in
    the page text (rapidfuzz partial_ratio >= 90). Adds verified=True/False.
    Returns (rows_with_verified, summary_string).
    """
    page_index = {p["page"]: p["text"] for p in pages}
    verified = 0
    total = 0
    result = []

    for row in rows:
        row = dict(row)
        quote = row.get("quote")
        page_num = row.get("page")
        if quote and page_num is not None:
            total += 1
            page_text = page_index.get(page_num, "")
            if page_text and fuzz.partial_ratio(quote, page_text) >= 90:
                verified += 1
                row["verified"] = True
            else:
                row["verified"] = False
        else:
            row["verified"] = False
        result.append(row)

    return result, f"{verified} of {total} fields verified"


def _load_demo() -> dict:
    with open(_DATA_DIR / "demo_coverage.json") as f:
        demo = json.load(f)
    # Normalise to flat structure (insurer at top level)
    if "policy" in demo and "insurer" not in demo:
        demo = dict(demo)
        demo["insurer"] = demo["policy"].get("insurer", "")
        demo["product_as_written"] = demo["policy"].get("product_as_written", "")
    return demo
