#!/bin/bash
# CodeDeploy Lifecycle Hook: BeforeInstall
# Prepares the environment before installing new application files

set -e

echo "============================================"
echo "BeforeInstall: Preparing Environment"
echo "============================================"
echo "Time: $(date)"
echo ""

# Create application directory if it doesn't exist
if [ ! -d "/var/www/bibidi-backend" ]; then
  echo "Creating application directory..."
  mkdir -p /var/www/bibidi-backend
fi

# Set ownership
echo "Setting directory ownership..."
chown -R ec2-user:ec2-user /var/www/bibidi-backend

# Create log directory
if [ ! -d "/var/log/bibidi-backend" ]; then
  echo "Creating log directory..."
  mkdir -p /var/log/bibidi-backend
  chown -R ec2-user:ec2-user /var/log/bibidi-backend
fi

# Clean up old deployment files (optional - be careful with this)
# Uncomment if you want to remove old files before each deployment
# echo "Cleaning up old files..."
# rm -rf /var/www/bibidi-backend/*

echo ""
echo "✅ BeforeInstall completed at $(date)"
echo "============================================"

exit 0
