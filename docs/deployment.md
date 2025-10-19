# Deployment Guide

## Environment Variables: Development vs Production

**Development:**
- Uses `.env` file with `dotenv.config()`
- Local database connections
- Development secrets

**Production:**
- Environment variables set by hosting platform
- No `.env` file (security best practice)
- Production database URLs and secrets

## Production Environment Variables

**Required:**
- `NODE_ENV=production`
- `DATABASE_URL` (production database connection string)
- `JWT_SECRET` (strong, unique secret key - use a password generator)
- `PORT` (usually set automatically by hosting platform)

**Optional:**
- `FRONTEND_URL` (production frontend URL for CORS)
- `BCRYPT_ROUNDS=12` (password hashing rounds)
- `STORAGE_DRIVER` (`local` or `s3`; defaults to `local`)
- `LOCAL_UPLOADS_DIR` (absolute path for local uploads when using `local` driver)
- `STORAGE_PUBLIC_URL` (public base URL to serve uploaded files)
- `UPLOAD_MAX_FILE_MB` (maximum upload size in megabytes; defaults to `15`)
- `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT` (required when using the `s3` driver)

## Platform-Specific Deployment

### Heroku
```bash
# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET="your-production-secret"
heroku config:set DATABASE_URL="postgresql://..."

# Deploy
git push heroku main
```

### Railway
```bash
# Environment variables set in Railway dashboard
# Automatic deployments from GitHub
```

### Docker Production
```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  app:
    build: .
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
    ports:
      - "3000:3000"
```

### VPS/Traditional Server
```bash
# Set environment variables in systemd service or .bashrc
export NODE_ENV=production
export DATABASE_URL="postgresql://..."
export JWT_SECRET="..."

# Build and start
npm run build
npm start
```

## Database Migrations in Production

**Important:** Run migrations before starting the application:

```bash
# Production migration workflow
npm run db:generate  # Generate migration files (if schema changed)
npm run db:migrate   # Apply migrations to production database
npm start           # Start the application
```

## Build and Deploy

```bash
# Build the application
npm run build

# Start production server
npm start
```

## Security Checklist

- [ ] Strong `JWT_SECRET` (use password generator)
- [ ] `NODE_ENV=production`
- [ ] No `.env` file in production
- [ ] HTTPS enabled
- [ ] Database connection over SSL
- [ ] Environment variables set via platform (not hardcoded)
- [ ] Error messages don't leak sensitive information