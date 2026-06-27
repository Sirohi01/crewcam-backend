import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes';
import companyRoutes from './routes/companyRoutes';
import superAdminRoutes from './routes/superAdminRoutes';
import masterDataRoutes from './routes/masterDataRoutes';
import employeeRoutes from './routes/employeeRoutes';
import uploadRoutes from './routes/uploadRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import settingsRoutes from './routes/settingsRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import leaveRoutes from './routes/leaveRoutes';
import meetingRoutes from './routes/meetingRoutes';
import communicationRoutes from './routes/communicationRoutes';
import hrAdminRoutes from './routes/hrAdminRoutes';
import pmsRoutes from './routes/pmsRoutes';
import hiringRoutes from './routes/hiringRoutes';
import financeRoutes from './routes/financeRoutes';
import supportRoutes from './routes/supportRoutes';
import sessionRoutes from './routes/sessionRoutes';
import auditLogRoutes from './routes/auditLogRoutes';
import permissionAdminRoutes from './routes/permissionAdminRoutes';
import todoRoutes from './routes/todoRoutes';
import employeeQueryRoutes from './routes/employeeQueryRoutes';
import liveTrackingRoutes from './routes/liveTrackingRoutes';
import aiHiringRoutes from './routes/aiHiringRoutes';
import aiEmployeeRoutes from './routes/aiEmployeeRoutes';
import jdKpaRoutes from './routes/jdKpaRoutes';
import locationRoutes from './routes/locationRoutes';
import path from 'path';
import { startRetentionJobs } from './utils/retentionJobs';
import { startCronJobs } from './utils/cronJobs';
import { startAutomationJobs } from './utils/automationJobs';

dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

const app = express();
const PORT = process.env.PORT || 8000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// Basic route
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'CREWCAM API is running' });
});

// API Routes (v1)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Limit each IP to 10 requests per window
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many requests from this IP, please try again after 15 minutes' },
  skip: (req, res) => process.env.NODE_ENV === 'development'
});

app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/super-admin', superAdminRoutes);
app.use('/api/v1/master-data', masterDataRoutes);
app.use('/api/v1/employees', employeeRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/leaves', leaveRoutes);
app.use('/api/v1/meetings', meetingRoutes);
app.use('/api/v1/communication', communicationRoutes);
app.use('/api/v1/hr-admin', hrAdminRoutes);
app.use('/api/v1/pms', pmsRoutes);
app.use('/api/v1/hiring', hiringRoutes);
app.use('/api/v1/finance', financeRoutes);
app.use('/api/v1/support', supportRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/audit-logs', auditLogRoutes);
app.use('/api/v1/permissions', permissionAdminRoutes);
app.use('/api/v1/todos', todoRoutes);
app.use('/api/v1/queries', employeeQueryRoutes);
app.use('/api/v1/tracking', liveTrackingRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/ai', aiHiringRoutes);
app.use('/api/v1/ai', aiEmployeeRoutes);
app.use('/api/v1', jdKpaRoutes);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    message: isProduction ? 'Internal Server Error' : err.message,
    ...(isProduction ? {} : { stack: err.stack })
  });
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM';
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    startRetentionJobs();
    startCronJobs();
    startAutomationJobs();
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });
