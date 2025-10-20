#!/bin/bash
# CodeDeploy Lifecycle Hook: ValidateService
# Validates that the application is running correctly

set -e

echo "============================================"
echo "ValidateService: Health Check"
echo "============================================"
echo "Time: $(date)"
echo ""

# Wait for application to fully start
echo "Waiting 10 seconds for application to start..."
sleep 10

# Check if PM2 process is running
echo "Checking PM2 process status..."
if ! pm2 list | grep -q "bibidi-backend"; then
  echo "❌ ERROR: PM2 process 'bibidi-backend' not found"
  pm2 list
  exit 1
fi

# Check if process is online
if ! pm2 list | grep "bibidi-backend" | grep -q "online"; then
  echo "❌ ERROR: PM2 process 'bibidi-backend' is not online"
  pm2 list
  pm2 logs bibidi-backend --lines 50 --nostream
  exit 1
fi

echo "✅ PM2 process is running and online"

# Health check HTTP endpoint
echo ""
echo "Performing HTTP health check..."
MAX_ATTEMPTS=10
ATTEMPT=0
HEALTH_CHECK_URL="http://localhost:3000/health"

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))
  echo "Attempt $ATTEMPT/$MAX_ATTEMPTS: Checking $HEALTH_CHECK_URL"
  
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_CHECK_URL" || echo "000")
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Health check passed! HTTP $HTTP_CODE"
    
    # Get and display the health check response
    RESPONSE=$(curl -s "$HEALTH_CHECK_URL")
    echo "Health check response: $RESPONSE"
    
    echo ""
    echo "✅ Service validation completed successfully at $(date)"
    echo "============================================"
    exit 0
  else
    echo "⚠️  Health check returned HTTP $HTTP_CODE"
    
    if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
      echo "Waiting 5 seconds before retry..."
      sleep 5
    fi
  fi
done

# If we get here, all attempts failed
echo ""
echo "❌ ERROR: Health check failed after $MAX_ATTEMPTS attempts"
echo "Last HTTP code: $HTTP_CODE"
echo ""
echo "PM2 process status:"
pm2 list
echo ""
echo "Recent application logs:"
pm2 logs bibidi-backend --lines 50 --nostream
echo "============================================"

exit 1
