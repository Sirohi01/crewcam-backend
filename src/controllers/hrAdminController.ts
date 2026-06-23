import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ComplianceRecord } from '../models/ComplianceRecord';
import { DisciplinaryAction } from '../models/DisciplinaryAction';
import { AuditLog } from '../models/AuditLog';
import { PolicyAcceptance } from '../models/PolicyAcceptance';
import { BGVRequest } from '../models/BGVRequest';

// Compliance Records
export const createComplianceRecord = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const record = await ComplianceRecord.create({ ...req.body, tenantId });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'CREATE_COMPLIANCE',
      module: 'HR_Admin',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { recordId: (record as any)._id }
    } as any);

    res.status(201).json(record);
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating compliance record', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getComplianceRecords = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const records = await ComplianceRecord.find({ tenantId } as any)
      .populate('employeeId', 'firstName lastName email');
    res.status(200).json(records);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching compliance records', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

// Disciplinary Actions
export const createDisciplinaryAction = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const action = await DisciplinaryAction.create({
      ...req.body,
      tenantId,
      issuedBy: req.user!._id as any
    });

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'CREATE_DISCIPLINARY',
      module: 'HR_Admin',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { actionId: (action as any)._id }
    } as any);

    res.status(201).json(action);
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating disciplinary action', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getDisciplinaryActions = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const actions = await DisciplinaryAction.find({ tenantId } as any)
      .populate('employeeId', 'firstName lastName email')
      .populate('issuedBy', 'firstName lastName email');
    res.status(200).json(actions);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching disciplinary actions', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

// Policy Tracking
export const assignPolicy = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const { employeeId, candidateId, policyId, policyVersion } = req.body;
    
    if (!employeeId && !candidateId) {
      return res.status(400).json({ message: 'Must provide either employeeId or candidateId' });
    }

    const policy = await PolicyAcceptance.create({
      tenantId,
      employeeId,
      candidateId,
      policyId,
      policyVersion,
      status: 'Pending'
    });

    res.status(201).json(policy);
  } catch (error: any) {
    res.status(500).json({ message: 'Error assigning policy', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getPolicyStatuses = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const policies = await PolicyAcceptance.find({ tenantId } as any)
      .populate('employeeId', 'firstName lastName email')
      .populate('candidateId', 'firstName lastName email')
      .populate('policyId', 'code category description');
      
    res.status(200).json(policies);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching policy statuses', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

// Background Verification (BGV)
export const createBGVRequest = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const { employeeId, candidateId, vendor, checksRequested } = req.body;
    
    if (!employeeId && !candidateId) {
      return res.status(400).json({ message: 'Must provide either employeeId or candidateId' });
    }

    const bgv = await BGVRequest.create({
      tenantId,
      employeeId,
      candidateId,
      vendor,
      checksRequested,
      requestedBy: req.user!._id,
      status: 'Initiated'
    });

    res.status(201).json(bgv);
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating BGV request', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getBGVRequests = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const requests = await BGVRequest.find({ tenantId } as any)
      .populate('employeeId', 'firstName lastName email')
      .populate('candidateId', 'firstName lastName email')
      .populate('requestedBy', 'firstName lastName email');
      
    res.status(200).json(requests);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching BGV requests', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const updateBGVStatus = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    
    const bgv = await BGVRequest.findOneAndUpdate(
      { _id: id, tenantId } as any,
      req.body,
      { new: true }
    );
    
    if (!bgv) return res.status(404).json({ message: 'BGV Request not found' });
    
    res.status(200).json(bgv);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating BGV status', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};
