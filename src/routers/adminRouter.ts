import { Router } from 'express';
import {
  getAllUsers,
  getUserById,
  deleteUser,
  assignRoleToUser,
  removeRoleFromUser,
  getSystemStats,
} from '../controllers/adminController';
import { initializeSampleData } from '../controllers/sampleDataController';
import { authenticateToken } from '../middlewares/auth';
import { hasRole } from '../middlewares/roleAuth';

const router = Router();

/**
 * Admin Routes
 * Base path: /api/admin
 * All routes require administrator role except init-sample-data in development
 */

// Development helper - no auth required for sample data generation
if (process.env.NODE_ENV === 'development') {
  router.post('/init-sample-data', initializeSampleData);
}

// Apply authentication and admin role check to all other routes
router.use(authenticateToken);
router.use(hasRole(['administrator']));

// User management routes
router.get('/users', getAllUsers);
router.get('/users/:id', getUserById);
router.delete('/users/:id', deleteUser);

// Role management routes
router.post('/users/:id/roles', assignRoleToUser);
router.delete('/users/:id/roles/:roleName', removeRoleFromUser);

// System statistics
router.get('/stats', getSystemStats);

// Production sample data endpoint (requires auth)
if (process.env.NODE_ENV !== 'development') {
  router.post('/init-sample-data', initializeSampleData);
}

export default router;