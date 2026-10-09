#!/bin/bash
# Autotech VPS Update Script
# This script pulls the latest changes from the V2 branch and restarts the services.

set -e

echo "Starting Autotech VPS Update..."

cd /opt/fujitech

# 1. Pull the latest code
echo "Pulling latest code from V2 branch..."
git fetch origin V2
git checkout V2
git pull origin V2

# 2. Rebuild and restart services
echo "Rebuilding and restarting Docker containers..."
docker-compose build web celery celery-beat
docker-compose up -d

# 3. Apply any new migrations and collect static files
echo "Applying database migrations..."
docker-compose exec -T web python manage.py migrate
docker-compose exec -T web python manage.py collectstatic --noinput

echo "Update complete! Services are running."
