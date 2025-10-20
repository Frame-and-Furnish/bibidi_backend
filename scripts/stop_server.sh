#!/bin/bash
# CodeDeploy Lifecycle Hook: ApplicationStop
# Stops the currently running application before new deployment

set -e

echo "============================================"
echo "ApplicationStop: Stopping Bibidi Backend"
echo "============================================"
echo "Time: $(date)"
echo ""

cd /var/www/bibidi-backend || exit 0

# Check if PM2 is running any processes
if pm2 list | grep -q "bibidi-backend"; then
  echo "Stopping PM2 process: bibidi-backend"
  pm2 stop bibidi-backend || true
  pm2 delete bibidi-backend || true
  echo "✅ Application stopped successfully"
else
  echo "No running PM2 process found (this is normal for first deployment)"
fi

# Save PM2 process list
pm2 save --force || true

echo ""
echo "ApplicationStop completed at $(date)"
echo "============================================"

exit 0
