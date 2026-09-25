#!/usr/bin/env bash
set -e

echo "==> Building and restarting containers..."
docker compose down --remove-orphans
docker compose up --build -d

echo "==> Done. Services:"
docker compose ps
