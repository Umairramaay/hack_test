import json
import os
import shutil
import uuid
import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from icalendar import Calendar
from sqlalchemy.orm import Session

from database import engine, get_db
from models import Base, UserInsurance

from dotenv import load_dotenv
import os

load_dotenv()

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

    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(UPLOAD_DIR, unique_name)

    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    record = UserInsurance(
        name=name,
        gender=gender,
        age=age,
        filename=file.filename,
        filepath=save_path,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "name": record.name,
        "gender": record.gender,
        "age": record.age,
        "filename": record.filename,
        "uploaded_at": record.uploaded_at.isoformat(),
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
