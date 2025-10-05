import { Router } from 'express';
import {
  createBooking,
  getUserBookings,
} from '../controllers/servicesController';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

/**
 * Bookings Routes
 * Base path: /api/bookings
 */

// All booking routes require authentication
router.post('/', authenticateToken, createBooking);
router.get('/', authenticateToken, getUserBookings);

export default router;