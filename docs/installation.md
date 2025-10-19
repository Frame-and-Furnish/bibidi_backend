# Installation & Setup

## Prerequisites (macOS/Linux)
- **Node.js** (v18 or higher)
  - macOS: `brew install node`
  - Ubuntu/Debian: `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs`
  - CentOS/RHEL: `sudo dnf install nodejs npm`
- **PostgreSQL** (v12 or higher)
- **Package Manager**: npm (included with Node.js) or yarn
- **Git**: Pre-installed on macOS/Linux or install via package manager

## 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd bibidi_backend

# Install dependencies
npm install
```

## 2. Environment Configuration

⚠️ **IMPORTANT: Create your .env file before proceeding with database setup!**

Create a `.env` file from the template:

```bash
cp .env.template .env
```

Configure your environment variables:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/bibidi_db

# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_change_in_production
JWT_EXPIRES_IN=7d

# CORS Configuration
FRONTEND_URL=http://localhost:3001

# Additional CORS support for mobile development
# Supports Expo, Capacitor, Ionic, and local network development
# The server automatically allows origins for:
# - Expo development server (http://localhost:8081, exp://192.168.*:8081)
# - Capacitor apps (capacitor://localhost)
# - Ionic apps (ionic://localhost)
# - Local network development (http://192.168.*:*)
# - React development (http://localhost:3000)

# Optional: Additional security settings
BCRYPT_ROUNDS=12
```

## 3. Database Setup

### Option 1: Use Supabase (Recommended - Free & Easy)
1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Go to Settings → Database → Connection String
4. Copy the connection string and update your `.env` file:
   ```env
   DATABASE_URL=your_supabase_connection_string_here
   ```

### Option 2: Use Docker (Local Development)
```bash
# Install Docker (if not already installed)
# macOS: brew install --cask docker
# Ubuntu/Debian: sudo apt install docker.io docker-compose-plugin
# CentOS/RHEL: sudo dnf install docker docker-compose-plugin

# Start PostgreSQL in Docker
docker compose up -d

# Your .env should have:
DATABASE_URL=postgresql://bibidi_user:bibidi_password@localhost:5432/bibidi_db
```

### Option 3: Local PostgreSQL Installation

**macOS:**
```bash
# Install PostgreSQL using Homebrew
brew install postgresql@15
brew services start postgresql@15

# Create database and user
createdb bibidi_db
createuser bibidi_user
psql -d postgres -c "ALTER USER bibidi_user PASSWORD 'bibidi_password';"
psql -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE bibidi_db TO bibidi_user;"
```

**Ubuntu/Debian:**
```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres createdb bibidi_db
sudo -u postgres createuser bibidi_user
sudo -u postgres psql -c "ALTER USER bibidi_user PASSWORD 'bibidi_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE bibidi_db TO bibidi_user;"
```

**CentOS/RHEL/Fedora:**
```bash
# Install PostgreSQL
sudo dnf install postgresql postgresql-server postgresql-contrib
sudo postgresql-setup --initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Create database and user
sudo -u postgres createdb bibidi_db
sudo -u postgres createuser bibidi_user
sudo -u postgres psql -c "ALTER USER bibidi_user PASSWORD 'bibidi_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE bibidi_db TO bibidi_user;"
```

**Update your .env file with:**
```env
DATABASE_URL=postgresql://bibidi_user:bibidi_password@localhost:5432/bibidi_db
```

## 4. Run Database Migrations

```bash
# Generate database migrations
npm run db:generate

# Run migrations to create tables
npm run db:migrate

# Optional: Open Drizzle Studio for database management
npm run db:studio
```

## 5. Initialize Sample Data (Optional)

For development and testing purposes, you can populate the database with realistic sample data:

```bash
# Make sure your development server is running first
npm run dev

# In a new terminal, initialize sample data
curl -X POST http://localhost:3000/api/admin/init-sample-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"

# Alternative: Use the endpoint directly in your API client
# POST http://localhost:3000/api/admin/init-sample-data
```

**What this creates:**
- **Admin User**: Full system access with admin dashboard capabilities
- **Recruiter User**: Team management and provider recruitment features
- **Sample Providers**: Various service providers across different categories
- **Service Categories**: Complete category structure with realistic examples
- **Provider Documents**: Sample certifications, licenses, and business documents
- **Realistic Data**: Professional profiles with contact information and specializations

**Access Control:**
- **Development**: No authentication required - endpoint is open for testing
- **Production**: Requires admin authentication token

**Sample Data Structure:**
```json
{
  "message": "Sample data initialized successfully",
  "data": {
    "users": 2,
    "categories": 15,
    "providers": 8,
    "documents": 24
  }
}
```

## 6. Start Development Server

```bash
# Development mode with hot reload
npm run dev

# Production build and start
npm run build
npm start
```

The server will start on `http://localhost:3000` (or your configured PORT).

## Development Tips

**Terminal Setup:**
```bash
# Check if Node.js and npm are properly installed
node --version && npm --version

# Use nvm for Node.js version management (recommended)
# Install nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
# Install latest LTS Node.js: nvm install --lts && nvm use --lts

# Check PostgreSQL status
# macOS: brew services list | grep postgresql
# Linux: sudo systemctl status postgresql
```

**Development Workflow:**
```bash
# Start PostgreSQL service if not running
# macOS: brew services start postgresql@15
# Linux: sudo systemctl start postgresql

# Monitor logs in real-time
npm run dev | tee logs/development.log

# Database management
npm run db:studio  # Opens browser-based database admin

# Check database connection
psql $DATABASE_URL -c "SELECT version();"
```

**File Permissions (Linux specific):**
```bash
# Ensure proper permissions for the project directory
chmod -R 755 /path/to/bibidi_backend
chown -R $USER:$USER /path/to/bibidi_backend
```