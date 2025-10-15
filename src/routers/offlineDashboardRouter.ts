import { Router } from 'express';
import { getOfflineDashboardOverview, getOfflineDashboardActivity } from '../controllers/offlineDashboardController';
import { authenticateToken } from '../middlewares/auth';
import { hasRole } from '../middlewares/roleAuth';

const router = Router();

router.use(authenticateToken, hasRole(['recruiter', 'administrator']));

router.get('/overview', getOfflineDashboardOverview);
router.get('/activity', getOfflineDashboardActivity);

export default router;
