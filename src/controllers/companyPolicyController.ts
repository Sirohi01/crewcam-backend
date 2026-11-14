import { Request, Response } from 'express';
import { CompanyPolicy } from '../models/CompanyPolicy';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { isOwnUploadUrl } from '../utils/fileStorage';

const errorBody = (message: string, error: any) => ({
  message,
  ...(process.env.NODE_ENV === 'production' ? {} : { error: error?.message }),
});

// Fields HR may set. tenantId, createdBy and updatedBy come from the session only.
const EDITABLE = [
  'title', 'code', 'category', 'subCategory', 'type', 'status', 'effectiveFrom', 'version',
  'shortDescription', 'detailedDescription', 'documentUrl', 'applicability', 'settings',
] as const;

const pickEditable = (body: any) =>
  Object.fromEntries(EDITABLE.filter((k) => body?.[k] !== undefined).map((k) => [k, body[k]]));

/**
 * Tell the covered employees about a newly published policy (or a new version of one).
 * Company-wide policies go out as one broadcast; targeted ones go to each matching person.
 */
const announcePolicy = async (policy: any, createdBy: unknown) => {
  const requireAck = policy.settings?.requireAck;
  const title = policy.version && policy.version !== '1.0' ? `Policy updated: ${policy.title}` : `New policy: ${policy.title}`;
  const message = `${policy.title} v${policy.version} is now in effect.${requireAck ? ' Please read and acknowledge it.' : ''}`;
  const base = { tenantId: policy.tenantId, title, message, link: '/dashboard/policies', priority: requireAck ? 'High' : 'Normal', createdBy, readBy: [] };

  const a = policy.applicability || {};
  if (a.allEmployees !== false) {
    await Notification.create({ ...base, audienceType: 'All' } as any);
    return;
  }
  const scope: any = { tenantId: policy.tenantId, isActive: true };
  if (a.departments?.length) scope.departmentId = { $in: a.departments };
  if (a.designations?.length) scope.designationId = { $in: a.designations };
  if (a.locations?.length) scope.branchId = { $in: a.locations };
  const users = await User.find(scope).select('_id').lean();
  if (users.length) {
    await Notification.insertMany(users.map((u: any) => ({ ...base, audienceType: 'User', audienceValue: u._id })) as any);
  }
};

export const createCompanyPolicy = async (req: Request, res: Response) => {
  try {
    const { tenantId, user } = req as any;
    const fields = pickEditable(req.body);
    if (fields.documentUrl && !isOwnUploadUrl(String(fields.documentUrl))) {
      return res.status(400).json({ message: 'The policy document must be uploaded through the app' });
    }

    // Ensure uniqueness of code within tenant
    const existing = await CompanyPolicy.findOne({ tenantId, code: fields.code });
    if (existing) {
      return res.status(400).json({ message: 'Policy with this code already exists' });
    }

    const policy = new CompanyPolicy({
      ...fields,
      tenantId,
      createdBy: user._id,
      updatedBy: user._id
    });

    await policy.save();
    if (policy.status === 'Published') await announcePolicy(policy, user._id);
    res.status(201).json({ message: 'Policy created successfully', data: policy });
  } catch (error: any) {
    console.error('Error creating company policy:', error);
    if (error.name === 'ValidationError') return res.status(400).json({ message: 'Invalid policy: check the required fields' });
    res.status(500).json(errorBody('Error creating policy', error));
  }
};

export const getCompanyPolicies = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req as any;
    const { departmentId } = req.query;

    const query: any = { tenantId };

    if (departmentId) {
      // Find policies that apply to all employees OR explicitly to this department
      query.$or = [
        { 'applicability.allEmployees': true },
        { 'applicability.departments': departmentId }
      ];
    }

    const policies = await CompanyPolicy.find(query)
      .populate('createdBy', 'firstName lastName')
      .populate('updatedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.status(200).json({ data: policies });
  } catch (error: any) {
    console.error('Error fetching company policies:', error);
    res.status(500).json(errorBody('Error fetching policies', error));
  }
};

export const getCompanyPolicyById = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req as any;
    const id = req.params.id as string;
    const policy = await CompanyPolicy.findOne({ _id: id, tenantId });

    if (!policy) {
      return res.status(404).json({ message: 'Policy not found' });
    }
    res.status(200).json({ data: policy });
  } catch (error: any) {
    console.error('Error fetching company policy:', error);
    res.status(500).json(errorBody('Error fetching policy', error));
  }
};

export const updateCompanyPolicy = async (req: Request, res: Response) => {
  try {
    const { tenantId, user } = req as any;
    const id = req.params.id as string;
    const fields = pickEditable(req.body);
    if (fields.documentUrl && !isOwnUploadUrl(String(fields.documentUrl))) {
      return res.status(400).json({ message: 'The policy document must be uploaded through the app' });
    }

    // Check if code changed and if it conflicts
    if (fields.code) {
      const existing = await CompanyPolicy.findOne({ tenantId, code: fields.code, _id: { $ne: id } });
      if (existing) {
        return res.status(400).json({ message: 'Policy with this code already exists' });
      }
    }

    const before: any = await CompanyPolicy.findOne({ _id: id, tenantId }).select('status version').lean();
    if (!before) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    const updated = await CompanyPolicy.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: { ...fields, updatedBy: user._id } },
      { returnDocument: 'after', runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    // Announce on first publish, or when a published policy gets a new version
    // (a new version also needs a fresh acknowledgement).
    const nowPublished = updated.status === 'Published';
    if (nowPublished && (before.status !== 'Published' || before.version !== updated.version)) {
      await announcePolicy(updated, user._id);
    }

    res.status(200).json({ message: 'Policy updated successfully', data: updated });
  } catch (error: any) {
    console.error('Error updating company policy:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') return res.status(400).json({ message: 'Invalid policy: check the fields' });
    res.status(500).json(errorBody('Error updating policy', error));
  }
};

export const deleteCompanyPolicy = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req as any;
    const id = req.params.id as string;
    const deleted = await CompanyPolicy.findOneAndDelete({ _id: id, tenantId });

    if (!deleted) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    res.status(200).json({ message: 'Policy deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting company policy:', error);
    res.status(500).json(errorBody('Error deleting policy', error));
  }
};
