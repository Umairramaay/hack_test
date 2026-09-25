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
from models import Base, UserInsurance

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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

    # Run OPENAI analysis for PDFs
    analysis = None
    if ext == ".pdf":
        if len(file_bytes) > MAX_ANALYZE_SIZE:
            logger.warning("[ANALYSIS] PDF too large (%d MB), skipping analysis", len(file_bytes) // 1024 // 1024)
        else:
            try:
                result = await analyze_insurance_pdf(file_bytes, original_name)
                analysis = result.model_dump()
            except Exception as e:
                logger.error("[ANALYSIS] Failed: %s", e)
                analysis = {"error": str(e)}

    return {"record": record_payload, "analysis": analysis}


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
