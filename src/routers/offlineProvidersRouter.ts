import { Router } from 'express';
import {
  createOfflineProvider,
  listOfflineProviders,
  getOfflineProvider,
  updateOfflineProvider,
  updateOfflineProviderStatus,
  uploadProviderDocument,
  attachProviderDocuments,
  deleteProviderDocument,
} from '../controllers/offlineProvidersController';
import { authenticateToken } from '../middlewares/auth';
import { hasRole } from '../middlewares/roleAuth';
import { singleFileUpload } from '../middlewares/upload';

const router = Router();

router.use(authenticateToken);

router.post('/', hasRole(['recruiter', 'administrator']), createOfflineProvider);
router.get('/', hasRole(['recruiter', 'administrator']), listOfflineProviders);
router.get('/:id', hasRole(['recruiter', 'administrator']), getOfflineProvider);
router.patch('/:id/status', hasRole(['administrator']), updateOfflineProviderStatus);
router.patch('/:id', hasRole(['recruiter', 'administrator']), updateOfflineProvider);
router.post(
  '/:id/documents/upload',
  hasRole(['recruiter', 'administrator']),
  singleFileUpload,
  uploadProviderDocument
);
router.post('/:id/documents', hasRole(['recruiter', 'administrator']), attachProviderDocuments);
router.delete(
  '/:providerId/documents/:documentId',
  hasRole(['recruiter', 'administrator']),
  deleteProviderDocument
);

export default router;
