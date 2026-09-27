import json
import logging
import os
import re
import unicodedata

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from icalendar import Calendar
from sqlalchemy.orm import Session

from database import engine, get_db
from ai_client import analyze_insurance_pdf
from checkup.extract import extract_coverage, find_policy_start_date, pdf_pages, verify_quotes
from checkup.match import build_plan, infer_product
from models import Base, UserInsurance
from price_estimate import estimate_price
from provider_search import search_providers, VALID_SERVICE_TYPES
from pydantic import BaseModel

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://3.145.6.208:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx"}


def to_folder_name(name: str) -> str:
    """Turn a user name into a safe directory name, e.g. 'John Doe' → 'john_doe'."""
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    clean = re.sub(r"[^a-zA-Z0-9\s]", "", normalized).strip().lower()
    return re.sub(r"\s+", "_", clean) or "user"


# ─── Provider search (LLM + web search) ──────────────────────────────────────

@app.get("/api/providers")
async def get_providers(service_type: str, lat: float, lng: float):
    if service_type not in VALID_SERVICE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid service_type. Must be one of: {', '.join(sorted(VALID_SERVICE_TYPES))}",
        )
    try:
        providers = await search_providers(service_type, lat, lng)
    except ValueError as e:
        logger.error("[PROVIDERS] LLM parse error: %s", e)
        raise HTTPException(status_code=502, detail=str(e))
    except RuntimeError as e:
        logger.error("[PROVIDERS] LLM search failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        logger.exception("[PROVIDERS] Unexpected error")
        raise HTTPException(status_code=500, detail="Failed to search for providers.")

    return {
        "service_type": service_type,
        "location":     {"latitude": lat, "longitude": lng},
        "providers":    providers,
    }


# ─── Price estimate (LLM + web search) ───────────────────────────────────────

class PriceEstimateRequest(BaseModel):
    label: str
    services: list[str] = []
    insurer: str = ""


@app.post("/api/price-estimate")
async def price_estimate(req: PriceEstimateRequest):
    try:
        return await estimate_price(req.label, req.services, req.insurer)
    except Exception as e:
        logger.exception("[PRICE] Estimate failed for %s", req.label)
        raise HTTPException(status_code=502, detail=f"Could not estimate a price: {e}")


# ─── Clinics (static data) ────────────────────────────────────────────────────

CLINICS_DATA_PATH = os.path.join(os.path.dirname(__file__), "clinics_data.json")


@app.get("/clinics")
def get_clinics():
    with open(CLINICS_DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


@app.get("/hello")
def hello():
    return {"message": "Hello World from FastAPI!"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/upload")
async def upload_insurance(
    name: str = Form(...),
    gender: str = Form(...),
    age: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Only PDF and Word documents are allowed (got {ext or 'no extension'})",
        )

    if gender not in ("male", "female", "other"):
        raise HTTPException(status_code=400, detail="Gender must be male, female, or other")

    if age < 1 or age > 120:
        raise HTTPException(status_code=400, detail="Age must be between 1 and 120")

    # Save into uploads/<user_folder>/<original_filename>
    user_folder = to_folder_name(name)
    user_dir = os.path.join(UPLOAD_DIR, user_folder)
    os.makedirs(user_dir, exist_ok=True)

    original_name = file.filename or f"document{ext}"
    save_path = os.path.join(user_dir, original_name)

    file_bytes = await file.read()
    with open(save_path, "wb") as f:
        f.write(file_bytes)

    record = UserInsurance(
        name=name,
        gender=gender,
        age=age,
        filename=original_name,
        filepath=save_path,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    record_payload = {
        "id": record.id,
        "name": record.name,
        "gender": record.gender,
        "age": record.age,
        "filename": record.filename,
        "filepath": record.filepath,
        "uploaded_at": record.uploaded_at.isoformat(),
    }

    # Checkup plan extraction
    coverage = None
    checkup_plan = None
    verification_summary = None
    used_demo = None

    _SEX_MAP = {"female": "F", "male": "M"}
    sex_char = _SEX_MAP.get(gender)

    if ext == ".pdf" and sex_char:
        try:
            pages = pdf_pages(save_path)
        except Exception as e:
            logger.warning("[CHECKUP] pdf_pages failed: %s", e)
            pages = []

        coverage, used_demo = await extract_coverage(pages)
        rows_v, verification_summary = verify_quotes(coverage.get("rows", []), pages)
        coverage["rows"] = rows_v
        coverage["policy_start_date"] = find_policy_start_date(pages) or coverage.get("policy_start_date")

        insurer = coverage.get("insurer", "")
        product = infer_product(insurer, coverage)

        try:
            checkup_plan = build_plan(
                sex=sex_char,
                age=age,
                coverage=coverage,
                insurer=insurer,
                product=product,
            )
        except Exception as e:
            logger.error("[CHECKUP] build_plan failed: %s", e)

    return {
        "record": record_payload,
        "coverage": coverage,
        "checkup_plan": checkup_plan,
        "verification_summary": verification_summary,
        "used_demo": used_demo,
    }


@app.get("/records")
def list_records(db: Session = Depends(get_db)):
    records = db.query(UserInsurance).order_by(UserInsurance.uploaded_at.desc()).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "gender": r.gender,
            "age": r.age,
            "filename": r.filename,
            "uploaded_at": r.uploaded_at.isoformat(),
        }
        for r in records
    ]


MAX_ANALYZE_SIZE = 15 * 1024 * 1024  # 15 MB


@app.post("/analyze-insurance")
async def analyze_insurance(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext != ".pdf":
        raise HTTPException(
            status_code=400,
            detail=f"Only PDF files are supported for analysis (got {ext or 'no extension'})",
        )

    content_type = file.content_type or ""
    if content_type and content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(
            status_code=400,
            detail=f"Unexpected MIME type: {content_type}. Upload a PDF file.",
        )

    pdf_bytes = await file.read()

    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    if len(pdf_bytes) > MAX_ANALYZE_SIZE:
        mb = len(pdf_bytes) // 1024 // 1024
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({mb} MB). Maximum supported size is 15 MB.",
        )

    try:
        result = await analyze_insurance_pdf(pdf_bytes, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        logger.error("[ANALYSIS] OpenAI call failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error during analysis")
        raise HTTPException(status_code=500, detail="Internal error during analysis")

    return result.model_dump()


@app.get("/config-test")
def config_test():
    return {
        "app_name": os.environ.get("APP_NAME", ""),
        "secret_loaded": bool(os.environ.get("API_SECRET")),
        "ical_configured": bool(os.environ.get("GOOGLE_CALENDAR_ICAL_URL")),
    }


@app.get("/ical-test")
async def ical_test():
    url = os.environ.get("GOOGLE_CALENDAR_ICAL_URL")

    if not url:
        raise HTTPException(status_code=500, detail="ICAL_URL not configured")

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(url)

    if not response.is_success:
        raise HTTPException(
            status_code=response.status_code,
            detail="Failed to fetch Google Calendar",
        )

    calendar = Calendar.from_ical(response.content)
    events = []

    for component in calendar.walk():
        if component.name == "VEVENT":
            start = component.get("dtstart")
            end = component.get("dtend")
            events.append(
                {
                    "summary": str(component.get("summary", "")),
                    "start": start.dt.isoformat() if start else None,
                    "end": end.dt.isoformat() if end else None,
                }
            )

    return {
        "success": True,
        "content_type": response.headers.get("content-type"),
        "content_length": len(response.content),
        "event_count": len(events),
        "events": events,
    }
