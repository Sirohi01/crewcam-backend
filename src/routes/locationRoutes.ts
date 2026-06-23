import { Router } from 'express';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.get('/pincode/:pincode', async (req, res) => {
  const pincode = String(req.params.pincode || '').trim();
  if (!/^\d{6}$/.test(pincode)) return res.status(400).json({ message: 'Enter a valid 6-digit PIN code' });
  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const result: any[] = await response.json();
    const office = result?.[0]?.PostOffice?.[0];
    if (!office) return res.status(404).json({ message: 'No location found for this PIN code' });
    res.json({ postalCode: pincode, country: office.Country || 'India', state: office.State || '', city: office.District || office.Block || '', locality: office.Name || '' });
  } catch {
    res.status(503).json({ message: 'PIN lookup is temporarily unavailable. Please enter the address manually.' });
  }
});

export default router;
