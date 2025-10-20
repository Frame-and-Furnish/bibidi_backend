#!/bin/bash
# CodeDeploy Lifecycle Hook: ApplicationStart
# Starts the application using PM2

set -e

echo "============================================"
echo "ApplicationStart: Starting Bibidi Backend"
echo "============================================"
echo "Time: $(date)"
echo ""

cd /var/www/bibidi-backend

# Ensure PM2 is properly configured for the ec2-user
export PM2_HOME=/home/ec2-user/.pm2

# Start the application using PM2 ecosystem file
echo "Starting application with PM2..."
pm2 start ecosystem.config.js --env production

# Save PM2 process list
echo "Saving PM2 process list..."
pm2 save

# Display running processes
echo ""
echo "PM2 Process List:"
pm2 list

echo ""
echo "✅ ApplicationStart completed at $(date)"
echo "============================================"

exit 0
