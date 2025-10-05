import { Router } from 'express';
import {
  getServices,
  getService,
  createService,
  initializeDefaultServices,
} from '../controllers/servicesController';
import { authenticateToken } from '../middlewares/auth';
import { hasRole } from '../middlewares/roleAuth';

const router = Router();

/**
 * Services Routes
 * Base path: /api/services
 */

// Public routes
router.get('/', getServices);
router.get('/:id', getService);

// Protected routes - require authentication and admin role
router.post('/', authenticateToken, hasRole(['administrator']), createService);
router.post('/init-defaults', authenticateToken, hasRole(['administrator']), initializeDefaultServices);

export default router;