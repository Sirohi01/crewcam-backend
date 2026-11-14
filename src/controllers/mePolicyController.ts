import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { CompanyPolicy } from '../models/CompanyPolicy';
import { PolicyAcknowledgement } from '../models/PolicyAcknowledgement';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';

/**
 * Company policies for employees (Phase 1D-2). Employees see published, portal-visible
 * policies that apply to them and acknowledge the ones that require it. HR reads who has
 * (and hasn't) acknowledged. Reading no longer needs MASTER_READ.
 */

const tenantIdOf = (req: AuthRequest) => (req.tenantId || req.user?.tenantId) as string;
const fail = (res: Response, message: string, error: any) =>
  res.status(500).json({ message, ...(process.env.NODE_ENV === 'production' ? {} : { error: error?.message }) });

/**
 * Policies a user is covered by. Not "all employees" → every list HR filled in must
 * match (department, designation, location = branch); an empty list doesn't restrict.
 */
export const applicablePolicyFilter = (tenantId: unknown, user: { departmentId?: unknown; designationId?: unknown; branchId?: unknown }) => {
  const matches = (path: string, value: unknown) => ({
    $or: [{ [path]: { $size: 0 } }, { [path]: { $exists: false } }, ...(value ? [{ [path]: value }] : [])],
  });
  return {
    tenantId,
    status: 'Published',
    'settings.showInPortal': { $ne: false },
    $or: [
      { 'applicability.allEmployees': { $ne: false } },
      {
        $and: [
          matches('applicability.departments', user.departmentId),
          matches('applicability.designations', user.designationId),
          matches('applicability.locations', user.branchId),
        ],
      },
    ],
  };
};

const PUBLIC_FIELDS = 'title code category subCategory type effectiveFrom version shortDescription detailedDescription documentUrl settings.requireAck updatedAt updatedBy';

export const getMyPolicies = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const [policies, acks] = await Promise.all([
      CompanyPolicy.find(applicablePolicyFilter(tenantId, req.user!) as any)
        .select(PUBLIC_FIELDS)
        .populate('updatedBy', 'firstName lastName')
        .sort({ effectiveFrom: -1 })
        .lean(),
      PolicyAcknowledgement.find({ tenantId, userId: req.user!._id } as any).select('policyId version acknowledgedAt').lean(),
    ]);

    const ackFor = (p: any) => acks.find((a: any) => String(a.policyId) === String(p._id) && a.version === p.version);
    const items = policies.map((p: any) => {
      const ack = ackFor(p);
      return {
        ...p,
        requiresAck: !!p.settings?.requireAck,
        acknowledgedAt: ack?.acknowledgedAt ?? null,
        settings: undefined,
      };
    });

    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    res.json({
      items,
      summary: {
        total: items.length,
        mandatory: items.filter((p) => p.type === 'Mandatory').length,
        pendingAck: items.filter((p) => p.requiresAck && !p.acknowledgedAt).length,
        acknowledged: items.filter((p) => p.acknowledgedAt).length,
        updatedRecently: items.filter((p) => p.updatedAt && new Date(p.updatedAt) >= monthAgo).length,
      },
    });
  } catch (error) {
    fail(res, 'Error fetching policies', error);
  }
};

/** Acknowledge the current version of a policy that applies to you. Idempotent. */
export const acknowledgeMyPolicy = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    if (req.body?.agree !== true) return res.status(400).json({ message: 'Confirm that you have read and agree to the policy' });

    const policy = await CompanyPolicy.findOne({ ...applicablePolicyFilter(tenantId, req.user!), _id: req.params.id } as any)
      .select('title version settings.requireAck');
    if (!policy) return res.status(404).json({ message: 'Policy not found' });

    const ack = await PolicyAcknowledgement.findOneAndUpdate(
      { tenantId, policyId: policy._id, userId: req.user!._id, version: policy.version } as any,
      {
        $setOnInsert: {
          tenantId, policyId: policy._id, userId: req.user!._id, version: policy.version,
          acknowledgedAt: new Date(), ipAddress: req.ip, userAgent: req.headers['user-agent'],
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
    await AuditLog.create({
      tenantId, userId: req.user!._id, action: 'ACKNOWLEDGE_POLICY', module: 'Policies', status: 'SUCCESS',
      ipAddress: req.ip as string, userAgent: req.headers['user-agent'] as string,
      details: { policyId: policy._id, version: policy.version },
    } as any);
    res.json({ message: `You acknowledged "${policy.title}" v${policy.version}`, acknowledgedAt: ack!.acknowledgedAt });
  } catch (error) {
    fail(res, 'Error acknowledging policy', error);
  }
};

/** HR: who has acknowledged the current version, and who is still pending. */
export const getPolicyAcknowledgements = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const policy: any = await CompanyPolicy.findOne({ _id: req.params.id, tenantId } as any).lean();
    if (!policy) return res.status(404).json({ message: 'Policy not found' });

    const scope: any = { tenantId, isActive: true };
    const a = policy.applicability || {};
    if (a.allEmployees === false) {
      if (a.departments?.length) scope.departmentId = { $in: a.departments };
      if (a.designations?.length) scope.designationId = { $in: a.designations };
      if (a.locations?.length) scope.branchId = { $in: a.locations };
    }
    const [employees, acks] = await Promise.all([
      User.find(scope).select('firstName lastName employeeCode').lean(),
      PolicyAcknowledgement.find({ tenantId, policyId: policy._id, version: policy.version } as any).select('userId acknowledgedAt').lean(),
    ]);
    const ackByUser = new Map(acks.map((x: any) => [String(x.userId), x.acknowledgedAt]));

    res.json({
      version: policy.version,
      acknowledged: employees.filter((e: any) => ackByUser.has(String(e._id))).map((e: any) => ({ ...e, acknowledgedAt: ackByUser.get(String(e._id)) })),
      pending: employees.filter((e: any) => !ackByUser.has(String(e._id))),
    });
  } catch (error) {
    fail(res, 'Error fetching acknowledgements', error);
  }
};
