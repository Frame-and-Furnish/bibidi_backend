# API Reference

## Health Check
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/health` | Server health status and uptime | Public |

## Authentication Routes (`/api/auth`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/register` | User registration | Public |
| POST | `/login` | User login | Public |
| GET | `/profile` | Get current user profile | Protected |

## Profile Routes (`/api/profiles`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | Get all provider profiles | Public |
| GET | `/:id` | Get single provider profile | Public |
| POST | `/` | Create provider profile | Provider/Admin |
| PUT | `/:id` | Update provider profile | Owner/Admin |

### Provider Profile Payload

`POST /api/profiles`

```json
{
  "firstName": "Jamie",
  "lastName": "Rivera",
  "businessName": "Jamie Rivera Plumbing",
  "serviceTitle": "Emergency Plumbing",
  "description": "Certified journeyman plumber focusing on emergency repairs.",
  "categoryId": 12,
  "pricePerHour": 95,
  "profilePictureURL": "https://example.com/avatar.jpg",
  "portfolioImageURLs": ["https://example.com/portfolio-1.jpg"],
  "latitude": 49.2827,
  "longitude": -123.1207,
  "locationString": "Vancouver, BC",
  "nextAvailability": "2025-10-15T09:00:00.000Z"
}
```

Creating a profile automatically ensures the user has the **provider** role and normalizes numeric and date fields. Any unknown category can be created by recruiters via the offline flow; self-serve onboarding requires an existing `categoryId`.

## Categories Routes (`/api/categories`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | Get all service categories | Public |
| POST | `/` | Create new category | Admin |
| PUT | `/:id` | Update category | Admin |
| DELETE | `/:id` | Delete category | Admin |

## Services Routes (`/api/services`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | Get all services | Public |
| POST | `/` | Create new service | Provider/Admin |
| GET | `/:id` | Get service by ID | Public |
| PUT | `/:id` | Update service | Owner/Admin |
| DELETE | `/:id` | Delete service | Owner/Admin |

## Bookings Routes (`/api/bookings`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | Get user's bookings | Protected |
| POST | `/` | Create new booking | Customer |
| GET | `/:id` | Get booking details | Owner/Admin |
| PUT | `/:id` | Update booking status | Provider/Admin |
| DELETE | `/:id` | Cancel booking | Owner/Admin |

## Admin Routes (`/api/admin`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/users` | Get all users | Admin |
| GET | `/users/:id` | Get user by ID | Admin |
| DELETE | `/users/:id` | Delete user | Admin |
| POST | `/users/:id/roles` | Assign role to user | Admin |
| DELETE | `/users/:id/roles/:roleName` | Remove role from user | Admin |
| GET | `/stats` | Get system statistics | Admin |

## Offline Provider Routes (`/api/offline/providers`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/` | Onboard a new provider profile | Recruiter/Admin |
| GET | `/` | List providers with filters | Recruiter/Admin |
| GET | `/:id` | Get provider details and documents | Recruiter/Admin |
| PATCH | `/:id` | Update provider profile metadata | Recruiter/Admin |
| PATCH | `/:id/status` | Change provider review status | Admin |
| POST | `/:id/documents/upload` | Upload a document file and store metadata | Recruiter/Admin |
| POST | `/:id/documents` | Attach existing document metadata | Recruiter/Admin |
| DELETE | `/:providerId/documents/:documentId` | Remove a provider document | Recruiter/Admin |

### Offline Onboarding Payload

`POST /api/offline/providers`

```json
{
  "fullName": "Alex Morgan",
  "email": "alex@example.com",
  "phone": "+1-604-555-0199",
  "serviceCategory": "Residential Painting",
  "city": "Kelowna, BC",
  "pricePerHour": 60,
  "fullAddress": "101 Main Street, Kelowna, BC",
  "bio": "Specializing in interior residential painting with 8 years of experience.",
  "profilePictureUrl": "https://example.com/headshot.jpg",
  "latitude": 49.888,
  "longitude": -119.496,
  "documents": [
    {
      "documentType": "insurance_certificate",
      "fileUrl": "https://storage.example.com/docs/123.pdf",
      "storageKey": "providers/alex-morgan/123.pdf",
      "fileName": "InsuranceCertificate.pdf",
      "mimeType": "application/pdf",
      "fileSize": 280345
    }
  ]
}
```

Recruiter onboarding uses the same underlying profile/document services as the self-serve flow and automatically:

- Ensures the recruited user has the **provider** role (creating it if necessary).
- Creates or reuses a service category based on `serviceCategory`.
- Normalizes price and geo fields for storage.
- Persists documents through the shared provider document service, enabling later listing and deletion.

## Database Schema

### Core Tables

**`users`** - Core user information
- `id`: UUID primary key
- `email`: Unique email address
- `password`: Hashed password
- `firstName`, `lastName`: User name fields

**`roles`** - Available roles (customer, provider, administrator)
- `id`: Serial primary key
- `name`: Unique role name

**`userRoles`** - Many-to-many relationship between users and roles
- `userId`: Foreign key to users
- `roleId`: Foreign key to roles

**`categories`** - Service categories with UI theming
- `id`: Serial primary key
- `name`: Category name
- `icon`: Icon identifier
- `color`: Hex color code

**`providerProfiles`** - Extended provider information
- `id`: UUID primary key
- `userId`: Foreign key to users
- `businessName`: Business name
- `categoryId`: Foreign key to categories
- `pricePerHour`: Hourly rate
- `rating`, `reviewCount`: Review system
- `latitude`, `longitude`: Location coordinates
- `isAvailable`: Availability status

**`services`** - Available services
- `id`: UUID primary key
- `name`: Service name
- `duration`: Duration in minutes
- `basePrice`: Base pricing
- `categoryId`: Foreign key to categories

**`bookings`** - Service bookings
- `id`: UUID primary key
- `customerId`: Foreign key to users (customer)
- `providerId`: Foreign key to users (provider)
- `serviceId`: Foreign key to services
- `bookingDate`: Date of booking
- `status`: Booking status (pending, confirmed, completed, cancelled)

**`timeSlots`** - Provider availability
- `id`: UUID primary key
- `providerId`: Foreign key to users (provider)
- `date`: Available date
- `time`: Available time slot
- `isAvailable`: Slot availability

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "timestamp": "2023-09-22T10:30:00.000Z"
}
```

### Error Response
```json
{
  "error": true,
  "message": "Error description",
  "code": "ERROR_CODE",
  "timestamp": "2023-09-22T10:30:00.000Z"
}
```