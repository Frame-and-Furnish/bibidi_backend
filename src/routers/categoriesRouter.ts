import { Router } from 'express';
import {
  getCategories,
  getCategory,
  createCategory,
  initializeDefaultCategories,
} from '../controllers/categoriesController';
import { authenticateToken } from '../middlewares/auth';
import { hasRole } from '../middlewares/roleAuth';

const router = Router();

/**
 * Categories Routes
 * Base path: /api/categories
 */

// Public routes
router.get('/', getCategories);
router.get('/:id', getCategory);

// Protected routes - require authentication and admin role
router.post('/', authenticateToken, hasRole(['administrator']), createCategory);
router.post('/init-defaults', authenticateToken, hasRole(['administrator']), initializeDefaultCategories);

export default router;