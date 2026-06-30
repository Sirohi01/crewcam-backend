import cron from 'node-cron';
import { runAllAutomationChecks } from '../services/automationService';

export const startAutomationJobs = () => {
  // Run every hour, on the hour
  cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running Super Admin automation checks');
    try {
      const result = await runAllAutomationChecks();
      console.log('[CRON] Automation checks completed:', JSON.stringify(result));
    } catch (err) {
      console.error('[CRON] Error running automation checks:', err);
    }
  });
};
