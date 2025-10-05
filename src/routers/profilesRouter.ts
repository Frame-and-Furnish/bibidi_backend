import { Router } from 'express';
import {
  getProviderProfiles,
  getProviderProfile,
  createProviderProfile,
  updateProviderProfile,
} from '../controllers/profilesController';
import { authenticateToken } from '../middlewares/auth';
import { hasRole, isOwnerOrAdmin } from '../middlewares/roleAuth';

const router = Router();

/**
 * Provider Profile Routes
 * Base path: /api/profiles
 */

// Public routes
router.get('/', getProviderProfiles);
router.get('/:id', getProviderProfile);

// Protected routes - require authentication
router.post('/', authenticateToken, hasRole(['provider', 'administrator']), createProviderProfile);
router.put('/:id', authenticateToken, updateProviderProfile);

export default router;