#!/bin/bash
# Autotech VPS Deployment Script
# This script sets up the environment and deploys the Autotech backend on a fresh Ubuntu VPS.

set -e

echo "Starting Autotech VPS Deployment..."

# 1. Update system and install dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose git curl nginx

# Enable Docker
sudo systemctl enable docker
sudo systemctl start docker

# 2. Clone repository if it doesn't exist
if [ ! -d "/opt/fujitech" ]; then
    sudo git clone https://github.com/ledinhtuyen92-hub/crmfujitech.git /opt/fujitech
    sudo chown -R $USER:$USER /opt/fujitech
fi

cd /opt/fujitech
git fetch origin
git checkout V2
git pull origin V2

# 3. Setup environment variables
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "Created .env file. Please update it with your actual settings (DB_PASSWORD, SITE_URL, etc.)"
fi

# 4. Build and start services
echo "Building and starting Docker containers..."
docker-compose build
docker-compose up -d

# 5. Run migrations
echo "Running database migrations..."
docker-compose exec -T web python manage.py migrate
docker-compose exec -T web python manage.py collectstatic --noinput

echo "Deployment complete! The application is running on port 8000."
echo "Remember to configure Nginx to proxy requests to 127.0.0.1:8000 and setup SSL."
