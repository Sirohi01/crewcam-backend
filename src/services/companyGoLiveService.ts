import { Tenant } from '../models/Tenant';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { buildCompanyGoLiveEmail, sendMail } from './mailer';

function getLoginUrl(): string {
  return process.env.FRONTEND_LOGIN_URL || 'https://app.crewcam.com/login';
}


export const goLiveTenant = async (tenantId: string): Promise<{ wasAlreadyLive: boolean }> => {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Tenant not found');

  const wasAlreadyLive = tenant.lifecycleStatus === 'LIVE';
  tenant.lifecycleStatus = 'LIVE';
  tenant.lifecycleUpdatedAt = new Date();
  if (tenant.setupFeeStatus !== 'PAID') tenant.setupFeeStatus = 'PAID';
  tenant.scheduledGoLiveAt = undefined;
  await tenant.save();

  const adminRole = await Role.findOne({ tenantId, name: 'Company Admin' }).lean();
  const adminUser = adminRole ? await User.findOne({ tenantId, roleId: adminRole._id }).lean() : null;
  if (adminUser?.email) {
    const company = await Company.findOne({ tenantId }).select('corporateId').lean();
    const { subject, html } = buildCompanyGoLiveEmail({
      companyName: tenant.name,
      adminFirstName: adminUser.firstName || 'there',
      loginUrl: getLoginUrl(),
      isFirstGoLive: !wasAlreadyLive,
      corporateId: company?.corporateId,
    });
    sendMail({ to: adminUser.email, subject, html }).catch((e) => console.error('[go-live] notification email failed:', e));
  }

  return { wasAlreadyLive };
};
