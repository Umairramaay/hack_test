import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/hello")
def hello():
    return {"message": "Hello World from FastAPI!"}


@app.get("/health")
def health():
    return {"status": "ok auto deploy"}


@app.get("/config-test")
def config_test():
    return {
        "app_name": os.environ.get("APP_NAME", ""),
        "secret_loaded": bool(os.environ.get("API_SECRET")),
    }
