import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import employeeRoutes from './routes/employees.js';
import departmentRoutes from './routes/departments.js';
import attendanceRoutes from './routes/attendance.js';
import leaveRoutes from './routes/leaves.js';
import payrollRoutes from './routes/payroll.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';
import userRoutes from './routes/users.js';
import accessRoutes from './routes/access.js';
import auditRoutes from './routes/audit.js';
import recruitmentRoutes from './routes/recruitment/index.js';
import onboardingRoutes from './routes/onboarding.js';
import offboardingRoutes from './routes/offboarding.js';
import candidatePortalRoutes from './routes/candidate-portal.js';
import expenseRoutes from './routes/expenses.js';
import performanceRoutes from './routes/performance.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (req, res) =>
    res.json({ status: 'ok', service: 'aurora-hr-api', time: new Date().toISOString() })
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/departments', departmentRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/leaves', leaveRoutes);
  app.use('/api/payroll', payrollRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/access', accessRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/recruitment', recruitmentRoutes);
  app.use('/api/onboarding', onboardingRoutes);
  app.use('/api/offboarding', offboardingRoutes);
  app.use('/api/portal/candidate', candidatePortalRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/performance', performanceRoutes);

  app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint not found.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.code === 'ER_DUP_ENTRY' ? 409 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({
      message:
        status >= 500
          ? 'Something went wrong on our end. Please try again.'
          : err.message || 'Request failed.',
    });
  });

  return app;
}
