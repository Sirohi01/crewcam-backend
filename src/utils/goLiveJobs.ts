import cron from 'node-cron';
import { Tenant } from '../models/Tenant';
import { goLiveTenant } from '../services/companyGoLiveService';

export const startGoLiveJobs = () => {
  // Checks every minute for companies whose "Schedule Go Live Later" time has arrived.
  cron.schedule('* * * * *', async () => {
    try {
      const due = await Tenant.find({
        scheduledGoLiveAt: { $lte: new Date() },
        lifecycleStatus: { $ne: 'LIVE' },
      }).select('_id').lean();

      for (const tenant of due) {
        try {
          await goLiveTenant(String(tenant._id));
          console.log(`[CRON] Tenant ${tenant._id} auto go-live completed (scheduled)`);
        } catch (err) {
          console.error(`[CRON] Failed to auto go-live tenant ${tenant._id}:`, err);
        }
      }
    } catch (err) {
      console.error('[CRON] Error running scheduled go-live job:', err);
    }
  });
};
