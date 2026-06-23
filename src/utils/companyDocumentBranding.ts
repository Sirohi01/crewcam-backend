import { Company } from '../models/Company';

/** Returns tenant-controlled formal-document branding; never hard-code it in a letter. */
export const getCompanyDocumentBranding = async (tenantId: unknown) => {
  const company = await Company.findOne({ tenantId, isActive: true } as any)
    .select('legalName tradeName logoUrl documentHeaderImageUrl documentFooterText')
    .lean();

  return {
    companyName: company?.tradeName || company?.legalName || 'Company',
    headerImageUrl: company?.documentHeaderImageUrl || company?.logoUrl || undefined,
    footerNote: company?.documentFooterText || 'This is a system-generated document.',
  };
};
