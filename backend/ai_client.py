import asyncio
import base64
import json
import logging
import os
import random
import time

import httpx

from prompts import INSURANCE_ANALYSIS_PROMPT
from schemas import InsuranceAnalysisResult

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.6-luna")
OPENAI_API_URL = "https://api.openai.com/v1/responses"

DEBUG_AI = os.environ.get("DEBUG_AI", "").lower() == "true"
MAX_PDF_BYTES = 15 * 1024 * 1024  # 15 MB inline limit

MAX_RETRIES = 3
BASE_BACKOFF_SECS = 1.0
# Transient errors worth retrying; everything else (401, 400, 403, 404) is permanent
TRANSIENT_STATUS_CODES = {429, 500, 502, 503, 504}


class _PermanentError(RuntimeError):
    """Non-retryable: bad/missing API key, unknown model, malformed request."""


def _classify_error(status_code: int, body: str) -> Exception:
    msg = f"OpenAI API returned {status_code}: {body[:500]}"
    logger.error("[AI] OpenAI error status=%s body_preview=%s", status_code, body[:200])
    if status_code in TRANSIENT_STATUS_CODES:
        return RuntimeError(msg)
    return _PermanentError(msg)


async def _openai_request(pdf_b64: str, filename: str) -> dict:
    if not OPENAI_API_KEY:
        raise _PermanentError("OPENAI_API_KEY is not set — add it to your .env file.")

    payload = {
        "model": OPENAI_MODEL,
        "input": [{
            "role": "user",
            "content": [
                {
                    "type": "input_file",
                    "filename": filename,
                    "file_data": f"data:application/pdf;base64,{pdf_b64}",
                },
                {
                    "type": "input_text",
                    "text": INSURANCE_ANALYSIS_PROMPT,
                },
            ],
        }],
        "text": {"format": {"type": "json_object"}},
        "max_output_tokens": 16384,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            OPENAI_API_URL,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if not resp.is_success:
        raise _classify_error(resp.status_code, resp.text)

    return resp.json()


def _extract_text(raw: dict) -> str:
    """
    Walk the Responses API output list looking for the first assistant message
    that contains an output_text part.  Avoids hard index assumptions because
    the output array can contain non-message items (tool calls, refusals, etc.).

    Expected structure:
      raw["output"][N] = {"type": "message", "role": "assistant",
                          "content": [{"type": "output_text", "text": "..."}]}
    """
    outputs = raw.get("output", [])
    if not outputs:
        raise ValueError(
            "OpenAI returned an empty output list. "
            f"Response keys: {list(raw.keys())}"
        )

    for item in outputs:
        if item.get("type") == "message" and item.get("role") == "assistant":
            for part in item.get("content", []):
                if part.get("type") == "output_text":
                    text = part.get("text", "")
                    if text:
                        return text
            # Assistant message found but no text content — surface what was there
            content_types = [p.get("type") for p in item.get("content", [])]
            raise ValueError(
                f"OpenAI assistant message contained no output_text. "
                f"Content types present: {content_types}"
            )

    output_types = [o.get("type") for o in outputs]
    raise ValueError(
        f"No assistant message found in OpenAI output. "
        f"Output item types present: {output_types}"
    )


def _log_usage(raw: dict, ai_duration: float) -> None:
    usage = raw.get("usage") or {}
    logger.info(
        "[AI] model=%s input_tokens=%s output_tokens=%s total_tokens=%s duration=%.2fs",
        raw.get("model", OPENAI_MODEL),
        usage.get("input_tokens", "?"),
        usage.get("output_tokens", "?"),
        usage.get("total_tokens", "?"),
        ai_duration,
    )


async def _request_with_retries(pdf_b64: str, filename: str) -> dict:
    last_exc: Exception = RuntimeError("No attempts made")
    for attempt in range(MAX_RETRIES):
        logger.info("[AI] OpenAI attempt=%d", attempt + 1)
        try:
            result = await _openai_request(pdf_b64, filename)
            logger.info("[AI] OpenAI success response_id=%s", result.get("id", "?"))
            if DEBUG_AI:
                # Log the full raw response for debugging (may contain PII — keep DEBUG_AI=false in prod)
                logger.debug("[AI] RAW RESPONSE\n%s", json.dumps(result, indent=2))
            return result
        except _PermanentError:
            raise
        except Exception as exc:
            last_exc = exc
            if attempt < MAX_RETRIES - 1:
                wait = BASE_BACKOFF_SECS * (2 ** attempt) + random.uniform(0, 0.5)
                logger.warning(
                    "[AI] OpenAI transient error attempt=%d error=%s",
                    attempt + 1, exc,
                )
                logger.warning("[AI] Retrying in %.1fs", wait)
                await asyncio.sleep(wait)
            else:
                logger.error("[AI] OpenAI failed after %d attempts: %s", MAX_RETRIES, exc)
    raise last_exc


async def analyze_insurance_pdf(pdf_bytes: bytes, filename: str) -> InsuranceAnalysisResult:
    total_t0 = time.perf_counter()

    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise ValueError(
            f"PDF is too large ({len(pdf_bytes) // 1024 // 1024} MB). "
            f"Maximum supported size is {MAX_PDF_BYTES // 1024 // 1024} MB."
        )

    size_kb = len(pdf_bytes) / 1024
    logger.info("[ANALYSIS] Started")
    logger.info("[DOCUMENT] size_kb=%.1f filename=%s", size_kb, filename)

    # Base64 encode
    t0 = time.perf_counter()
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    logger.info("[ANALYSIS] PDF encoded: %.3fs", time.perf_counter() - t0)

    # OpenAI API call
    logger.info("[ANALYSIS] OpenAI request started model=%s", OPENAI_MODEL)
    t_ai = time.perf_counter()
    try:
        raw = await _request_with_retries(pdf_b64, filename)
    except _PermanentError as exc:
        logger.error("[ANALYSIS] Permanent error (no retry): %s", exc)
        raise
    except Exception as exc:
        logger.error("[ANALYSIS] Analysis failed after retries: %s", exc)
        raise RuntimeError(f"OpenAI analysis failed after {MAX_RETRIES} attempts: {exc}") from exc

    ai_elapsed = time.perf_counter() - t_ai
    logger.info("[ANALYSIS] OpenAI request: %.2fs", ai_elapsed)
    logger.info("[AI] response_id=%s", raw.get("id", "?"))
    _log_usage(raw, ai_elapsed)

    # Extract text from response
    t0 = time.perf_counter()
    try:
        raw_text = _extract_text(raw)
    except ValueError as exc:
        logger.error("[ANALYSIS] Response extraction failed: %s", exc)
        raise
    logger.info(
        "[ANALYSIS] Output length: %d chars | preview: %.200s",
        len(raw_text), raw_text,
    )
    logger.info("[ANALYSIS] Text extraction: %.3fs", time.perf_counter() - t0)

    # Parse JSON
    t0 = time.perf_counter()
    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        logger.error("[ANALYSIS] JSON parsing failed: %s | preview: %.500s", exc, raw_text)
        raise ValueError(f"OpenAI returned malformed JSON: {exc}") from exc
    logger.info("[ANALYSIS] JSON parsing: %.3fs", time.perf_counter() - t0)

    if not parsed.get("document", {}).get("filename"):
        parsed.setdefault("document", {})["filename"] = filename

    # Pydantic validation
    t0 = time.perf_counter()
    try:
        result = InsuranceAnalysisResult.model_validate(parsed)
    except Exception as exc:
        logger.error(
            "[ANALYSIS] Pydantic validation failed: %s | top-level keys: %s",
            exc, list(parsed.keys()),
        )
        raise ValueError(f"Analysis response failed validation: {exc}") from exc
    logger.info("[ANALYSIS] JSON validation: %.3fs", time.perf_counter() - t0)

    logger.info("[ANALYSIS] Total: %.2fs", time.perf_counter() - total_t0)

    return result
