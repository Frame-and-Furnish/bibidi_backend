# Bibidi Backend 🏗️

A modern, scalable backend API built with Node.js, Express, TypeScript, Drizzle ORM, and PostgreSQL for **Bibidi** - a social network platform designed specifically for service workers in the home improvement, maintenance, and construction sectors.

## 🚀 Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Authentication**: JWT with bcryptjs
- **Security**: Helmet, CORS, input validation

## ✨ Key Features

- **Multi-Role Authentication** - Customer, Provider, Administrator roles
- **Provider Profiles** - Business profiles with portfolios and ratings
- **Service Management** - Categories, listings, pricing, and duration
- **Booking System** - Complete booking management with time slots
- **Security** - JWT authentication, role-based access control, input validation

## 🚀 Quick Start

1. **Clone and install:**
   ```bash
   git clone <repository-url>
   cd bibidi_backend
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.template .env
   # Edit .env with your database URL and JWT secret
   ```

3. **Start database** (choose one):
   ```bash
   # Option 1: Docker (easiest)
   docker compose up -d
   
   # Option 2: Use Supabase (cloud)
   # Create account at supabase.com and get connection string
   
   # Option 3: Local PostgreSQL
   # See docs/installation.md for detailed setup
   ```

4. **Run migrations and start:**
   ```bash
   npm run db:migrate
   npm run dev
   ```

Server runs on `http://localhost:3000`

## 📚 Documentation

- **[Installation & Setup](docs/installation.md)** - Detailed setup instructions for macOS/Linux
- **[API Reference](docs/api.md)** - Complete API endpoints and database schema
- **[Deployment](docs/deployment.md)** - Production deployment guide

## 🔧 Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start           # Start production server
npm run db:generate  # Generate database migrations
npm run db:migrate   # Run database migrations
npm run db:studio   # Open database admin interface
```

## 🔐 API Overview

- **Health**: `GET /health`
- **Auth**: `POST /api/auth/register`, `POST /api/auth/login`
- **Profiles**: `GET /api/profiles`, `POST /api/profiles`
- **Categories**: `GET /api/categories` (service categories)
- **Services**: `GET /api/services` (service listings)
- **Bookings**: `GET /api/bookings`, `POST /api/bookings`
- **Admin**: `GET /api/admin/users` (admin only)

See [API Reference](docs/api.md) for complete details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

For questions or issues:
- Create an issue in this repository
- Check the [documentation](docs/)

---

**Bibidi Backend** - Empowering service workers through technology 🚀