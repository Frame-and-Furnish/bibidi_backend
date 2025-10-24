import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables FIRST before any other imports that might use them
dotenv.config();

import { connectDB } from './db/connectDB';

// Import routers
import authRouter from './routers/authRouter';
import profilesRouter from './routers/profilesRouter';
import adminRouter from './routers/adminRouter';
import categoriesRouter from './routers/categoriesRouter';
import servicesRouter from './routers/servicesRouter';
import bookingsRouter from './routers/bookingsRouter';
import recruitersRouter from './routers/recruitersRouter';
import offlineProvidersRouter from './routers/offlineProvidersRouter';
import offlineDashboardRouter from './routers/offlineDashboardRouter';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3001',
    'http://localhost:8081', // Expo development server
    'exp://192.168.*:8081', // Expo on local network
    'exp://localhost:8081', // Expo localhost
    'capacitor://localhost', // Capacitor apps
    'ionic://localhost', // Ionic apps
    'http://localhost:3000', // React development
    'http://192.168.*:*', // Local network development
    'https://bibidi-offlineteam.vercel.app',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['X-Total-Count'],
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve local uploads when using local storage driver
// Skip local uploads setup in Vercel serverless environment
/*
if ((process.env.STORAGE_DRIVER || 'local') !== 's3') {
  const uploadsDir = process.env.LOCAL_UPLOADS_DIR || path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));
}
*/

// Request logging middleware (simple console logging)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/services', servicesRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/recruiters', recruitersRouter);
app.use('/api/offline/providers', offlineProvidersRouter);
app.use('/api/offline/dashboard', offlineDashboardRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Bibidi API',
    version: '1.0.0',
    description: 'Social network platform for service workers in home improvement, maintenance, and construction sectors',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      profiles: '/api/profiles',
      admin: '/api/admin',
      categories: '/api/categories',
      services: '/api/services',
      bookings: '/api/bookings',
    },
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: true,
    message: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', error);

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: true,
      message: 'Invalid token',
      code: 'INVALID_TOKEN',
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: true,
      message: 'Token expired',
      code: 'TOKEN_EXPIRED',
    });
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: true,
      message: error.message,
      code: 'VALIDATION_ERROR',
    });
  }

  // Handle database errors
  if (error.code === '23505') {
    return res.status(409).json({
      error: true,
      message: 'Resource already exists',
      code: 'DUPLICATE_RESOURCE',
    });
  }

  // Default server error
  return res.status(500).json({
    error: true,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    code: 'INTERNAL_SERVER_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
});

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDB();

    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Bibidi Server is running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 API Base URL: http://localhost:${PORT}`);
      console.log(`📋 Health Check: http://localhost:${PORT}/health`);
      console.log(`📝 API Documentation: http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();

export default app;