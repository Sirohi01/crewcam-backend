import { LeadStage } from '../models/Lead';

const STAGE_BASE: Record<LeadStage, number> = {
  LEAD: 20,
  DEMO_SCHEDULED: 40,
  PROPOSAL_SENT: 55,
  QUOTATION_APPROVED: 70,
  WON: 100,
  LOST: 10,
};

interface ScoreableLead {
  stage: LeadStage;
  contactPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  industry?: string;
  fullAddress?: string;
  assignedTo?: unknown;
  followUpDate?: Date | null;
  estimatedValue?: number;
}

export function calculateLeadScore(lead: ScoreableLead): number {
  let score = STAGE_BASE[lead.stage] ?? 20;
  if (lead.contactPhone) score += 5;
  if (lead.companyEmail) score += 5;
  if (lead.companyWebsite) score += 5;
  if (lead.industry) score += 5;
  if (lead.fullAddress) score += 5;
  if (lead.assignedTo) score += 5;
  if (lead.followUpDate) score += 5;
  if (lead.estimatedValue && lead.estimatedValue > 0) score += 5;
  return Math.max(0, Math.min(100, score));
}
