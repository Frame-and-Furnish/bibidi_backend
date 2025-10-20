#!/bin/bash
# CodeDeploy Lifecycle Hook: AfterInstall
# Configures the application after files are copied

set -e

echo "============================================"
echo "AfterInstall: Configuring Application"
echo "============================================"
echo "Time: $(date)"
echo ""

cd /var/www/bibidi-backend

# Display deployment info
if [ -f version.json ]; then
  echo "Deployment version info:"
  cat version.json
  echo ""
fi

# Fetch environment variables from AWS Secrets Manager
echo "Fetching secrets from AWS Secrets Manager..."
SECRET_NAME="bibidi/backend/production"

# Check if secret exists
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" &>/dev/null; then
  echo "Retrieving secret: $SECRET_NAME"
  aws secretsmanager get-secret-value \
    --secret-id "$SECRET_NAME" \
    --query SecretString \
    --output text > .env
  
  echo "✅ Secrets retrieved successfully"
  
  # Fetch RDS database credentials automatically
  echo "Fetching RDS database credentials..."
  
  # Get the database secret ARN from CloudFormation stack
  DB_SECRET_ARN=$(aws cloudformation describe-stacks \
    --stack-name BibidiBackendStack \
    --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$DB_SECRET_ARN" ]; then
    echo "Found database secret: $DB_SECRET_ARN"
    
    # Get database credentials
    DB_PASSWORD=$(aws secretsmanager get-secret-value \
      --secret-id "$DB_SECRET_ARN" \
      --query SecretString \
      --output text | jq -r '.password')
    
    DB_ENDPOINT=$(aws cloudformation describe-stacks \
      --stack-name BibidiBackendStack \
      --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
      --output text)
    
    DB_PORT=$(aws cloudformation describe-stacks \
      --stack-name BibidiBackendStack \
      --query 'Stacks[0].Outputs[?OutputKey==`DatabasePort`].OutputValue' \
      --output text)
    
    # Construct DATABASE_URL
    DATABASE_URL="postgresql://bibidi_admin:${DB_PASSWORD}@${DB_ENDPOINT}:${DB_PORT}/postgres"
    
    # Update .env file with actual DATABASE_URL
    if grep -q "DATABASE_URL=" .env; then
      sed -i "s|DATABASE_URL=.*|DATABASE_URL=\"$DATABASE_URL\"|" .env
    else
      echo "DATABASE_URL=\"$DATABASE_URL\"" >> .env
    fi
    
    echo "✅ Database credentials configured"
  else
    echo "⚠️  No RDS database found in stack (this is OK for initial setup)"
  fi
  
else
  echo "⚠️  Warning: Secret $SECRET_NAME not found in Secrets Manager"
  echo "Creating a placeholder .env file"
  echo "You need to create the secret in AWS Secrets Manager"
  
  # Create a basic .env file as fallback
  cat > .env << 'EOF'
# WARNING: This is a placeholder .env file
# Create the secret 'bibidi/backend/production' in AWS Secrets Manager
# with your actual environment variables

NODE_ENV=production
PORT=3000
# DATABASE_URL will be auto-configured from RDS
# Add your JWT_SECRET, etc.
EOF
fi

# Set proper permissions on .env file
echo "Setting .env file permissions..."
chmod 600 .env
chown ec2-user:ec2-user .env

# Ensure all files have correct ownership
echo "Setting file ownership..."
chown -R ec2-user:ec2-user /var/www/bibidi-backend

# Install/update dependencies (in case of version changes)
# Note: We already have node_modules from the deployment package,
# but this ensures everything is in sync
echo "Verifying dependencies..."
if [ -f package-lock.json ]; then
  npm ci --production --quiet || echo "Dependencies already installed from package"
fi

# Create uploads directory if using local storage
if [ ! -d "uploads" ]; then
  echo "Creating uploads directory..."
  mkdir -p uploads
  chown ec2-user:ec2-user uploads
fi

# Display application info
echo ""
echo "Application configuration:"
echo "- Node.js version: $(node --version)"
echo "- NPM version: $(npm --version)"
echo "- PM2 version: $(pm2 --version)"
echo "- Working directory: $(pwd)"
echo ""

echo "✅ AfterInstall completed at $(date)"
echo "============================================"

exit 0
