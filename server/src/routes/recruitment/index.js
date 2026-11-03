import { Router } from 'express';
import dashboardRoutes from './dashboard.js';
import jobRoutes from './jobs.js';
import candidateRoutes from './candidates.js';
import applicationRoutes from './applications.js';
import interviewRoutes from './interviews.js';
import offerRoutes from './offers.js';
import reportRoutes from './reports.js';

/**
 * /api/recruitment — all routes authenticate individually and enforce module
 * permissions with backend middleware.
 */
const router = Router();

router.use('/dashboard', dashboardRoutes);
router.use('/jobs', jobRoutes);
router.use('/candidates', candidateRoutes);
router.use('/applications', applicationRoutes);
router.use('/interviews', interviewRoutes);
router.use('/offers', offerRoutes);
router.use('/reports', reportRoutes);

export default router;
