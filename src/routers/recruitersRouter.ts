import { Router } from 'express';
import {
  registerRecruiter,
  createRecruiterInvitation,
  listRecruiterInvitations,
  revokeRecruiterInvitation,
  listRecruiters,
  getCurrentRecruiterProfile,
  updateCurrentRecruiterProfile,
  updateRecruiterStatus,
} from '../controllers/recruitersController';
import { authenticateToken } from '../middlewares/auth';
import { hasRole } from '../middlewares/roleAuth';

const router = Router();

// Public routes
router.post('/register', registerRecruiter);

// Admin invitation management
router.post('/invitations', authenticateToken, hasRole(['administrator']), createRecruiterInvitation);
router.get('/invitations', authenticateToken, hasRole(['administrator']), listRecruiterInvitations);
router.patch('/invitations/:id/revoke', authenticateToken, hasRole(['administrator']), revokeRecruiterInvitation);

// Authenticated recruiter routes
router.get(
  '/me',
  authenticateToken,
  hasRole(['recruiter', 'administrator']),
  getCurrentRecruiterProfile
);
router.patch(
  '/me',
  authenticateToken,
  hasRole(['recruiter', 'administrator']),
  updateCurrentRecruiterProfile
);

// Admin recruiter management
router.get('/', authenticateToken, hasRole(['administrator']), listRecruiters);
router.patch('/:id/status', authenticateToken, hasRole(['administrator']), updateRecruiterStatus);

export default router;
