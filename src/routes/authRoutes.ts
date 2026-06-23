import { Router } from 'express';
import { login, login2FA, register, refreshToken, logout, forgotPassword, resetPassword, setup2FA, verifyAndEnable2FA, disable2FA } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// Apply strict rate limiting to all authentication routes
router.use(authLimiter);

router.post('/login', login);
router.post('/login/2fa', login2FA);
router.post('/register', register);
router.post('/refresh', refreshToken);
router.post('/logout', logout);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected 2FA routes
router.get('/2fa/setup', authenticate, setup2FA);
router.post('/2fa/enable', authenticate, verifyAndEnable2FA);
router.post('/2fa/disable', authenticate, disable2FA);

export default router;
