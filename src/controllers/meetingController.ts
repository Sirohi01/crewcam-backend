import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Meeting } from '../models/Meeting';
import { MeetingMoM } from '../models/MeetingMoM';
import { AuditLog } from '../models/AuditLog';
import { Status } from '../models/Status';
import { notifyUser } from './communicationController';

const getActiveMeetingStatusNames = async (tenantId: any) => {
  const statuses = await Status.find({ tenantId, category: 'Meeting', isActive: true } as any).select('name').lean();
  const names = statuses.map((s: any) => s.name as string);
  // Fall back to the original hardcoded set if HR hasn't seeded Meeting statuses yet,
  // so the page doesn't break on a fresh tenant that hasn't visited Master Data.
  return names.length > 0 ? names : ['Scheduled', 'Ongoing', 'Completed', 'Postponed', 'Cancelled'];
};

export const createMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    
    const {
      title, description, startTime, endTime, attendeeIds, meetingLink, mode, location,
      address, pincode, city, state, country, lat, lng, createdLat, createdLng,
    } = req.body;

    if (!title || !startTime || !endTime) {
      return res.status(400).json({ message: 'Title, start time, and end time are required' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      return res.status(400).json({ message: 'Start time must be before end time' });
    }

    const resolvedMode = mode === 'Field' ? 'Field' : 'Online';
    if (resolvedMode === 'Online' && !meetingLink) {
      return res.status(400).json({ message: 'Meeting link is required for an online meeting' });
    }
    if (resolvedMode === 'Field' && !address) {
      return res.status(400).json({ message: 'Address is required for a field meeting' });
    }

    const meeting = await Meeting.create({
      tenantId,
      title,
      description,
      startTime: start,
      endTime: end,
      organizerId: req.user!._id as any,
      attendeeIds: attendeeIds || [],
      meetingLink,
      status: 'Scheduled',
      mode: resolvedMode,
      location,
      ...(resolvedMode === 'Field' ? { address, pincode, city, state, country, lat, lng, createdLat, createdLng } : {}),
    } as any);

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'CREATE_MEETING',
      module: 'Meetings',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { meetingId: (meeting as any)._id }
    } as any);

    res.status(201).json({ message: 'Meeting scheduled successfully', meeting });
  } catch (error: any) {
    res.status(500).json({ message: 'Error scheduling meeting', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const updateMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    
    const { id } = req.params;
    const {
      title, description, startTime, endTime, attendeeIds, meetingLink, mode, location,
      address, pincode, city, state, country, lat, lng, createdLat, createdLng,
    } = req.body;

    if (!title || !startTime || !endTime) {
      return res.status(400).json({ message: 'Title, start time, and end time are required' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      return res.status(400).json({ message: 'Start time must be before end time' });
    }

    const resolvedMode = mode === 'Field' ? 'Field' : 'Online';
    if (resolvedMode === 'Online' && !meetingLink) {
      return res.status(400).json({ message: 'Meeting link is required for an online meeting' });
    }
    if (resolvedMode === 'Field' && !address) {
      return res.status(400).json({ message: 'Address is required for a field meeting' });
    }

    const updateData: any = {
      title,
      description,
      startTime: start,
      endTime: end,
      attendeeIds: attendeeIds || [],
      meetingLink,
      mode: resolvedMode,
      location,
    };

    if (resolvedMode === 'Field') {
      updateData.address = address;
      updateData.pincode = pincode;
      updateData.city = city;
      updateData.state = state;
      updateData.country = country;
      updateData.lat = lat;
      updateData.lng = lng;
      if (createdLat) updateData.createdLat = createdLat;
      if (createdLng) updateData.createdLng = createdLng;
    } else {
      updateData.$unset = { address: 1, pincode: 1, city: 1, state: 1, country: 1, lat: 1, lng: 1, createdLat: 1, createdLng: 1 };
    }

    const meeting = await Meeting.findOneAndUpdate(
      { _id: id, tenantId, organizerId: req.user!._id as any } as any,
      updateData,
      { new: true }
    );

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found or you are not the organizer' });
    }

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'UPDATE_MEETING',
      module: 'Meetings',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { meetingId: (meeting as any)._id }
    } as any);

    res.status(200).json({ message: 'Meeting updated successfully', meeting });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating meeting', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMeetings = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    // Both organized by me OR attended by me
    const userId = req.user?._id;
    const { status } = req.query;

    const filter: any = {
      tenantId,
      $or: [
        { organizerId: userId },
        { attendeeIds: userId }
      ]
    };
    if (status) {
      const activeStatusNames = await getActiveMeetingStatusNames(tenantId);
      if (activeStatusNames.includes(String(status))) {
        filter.status = status;
      }
    }

    const meetings = await Meeting.find(filter)
      .populate({ path: 'organizerId', select: 'firstName lastName email profilePictureUrl branchId', populate: { path: 'branchId', select: 'name lat lng' } })
      .populate('attendeeIds', 'firstName lastName email profilePictureUrl')
      .sort({ startTime: 1 });

    res.status(200).json(meetings);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching meetings', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMeetingById = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const meeting = await Meeting.findOne({ _id: req.params.id, tenantId } as any)
      .populate({ path: 'organizerId', select: 'firstName lastName email profilePictureUrl branchId', populate: { path: 'branchId', select: 'name address city state pincode lat lng' } })
      .populate('attendeeIds', 'firstName lastName email profilePictureUrl')
      .populate('completedBy', 'firstName lastName');
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (!isMeetingParticipant(meeting, String(req.user._id))) {
      return res.status(403).json({ message: 'Only the organizer or an attendee can view this meeting' });
    }

    res.status(200).json(meeting);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching meeting', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const cancelMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const { id } = req.params;

    const meeting = await Meeting.findOneAndUpdate(
      { _id: id, tenantId, organizerId: req.user!._id as any } as any, // Only organizer can cancel
      { status: 'Cancelled' },
      { returnDocument: 'after' }
    );

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found or you are not the organizer' });
    }

    await AuditLog.create({
      tenantId,
      userId: req.user!._id as any,
      action: 'CANCEL_MEETING',
      module: 'Meetings',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { meetingId: (meeting as any)._id }
    } as any);

    res.status(200).json({ message: 'Meeting cancelled successfully', meeting });
  } catch (error: any) {
    res.status(500).json({ message: 'Error cancelling meeting', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

// `meeting.organizerId`/`attendeeIds` are sometimes raw ObjectIds (unpopulated calls
// like cancelMeeting) and sometimes populated User documents (getMeetingById) — unwrap
// to the id either way before comparing, otherwise String(populatedDoc) is "[object
// Object]" and this always returns false against a populated meeting.
const idOf = (x: any) => (x && typeof x === 'object' && x._id ? x._id : x);
const isMeetingParticipant = (meeting: any, userId: string) =>
  String(idOf(meeting.organizerId)) === String(userId) ||
  (meeting.attendeeIds || []).some((a: any) => String(idOf(a)) === String(userId));

/**
 * Generic status transition (Ongoing/Completed/Postponed/...), validated against the
 * tenant's active Meeting-category Status records rather than a fixed enum. Marking a
 * meeting Completed notifies every other participant — organizer + attendees minus
 * whoever triggered the change — so "jisko meeting di hai" finds out it wrapped up.
 */
export const updateMeetingStatus = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: 'status is required' });

    const activeStatusNames = await getActiveMeetingStatusNames(tenantId);
    if (!activeStatusNames.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${activeStatusNames.join(', ')}` });
    }

    const meeting: any = await Meeting.findOne({ _id: id, tenantId } as any);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (!isMeetingParticipant(meeting, String(req.user._id))) {
      return res.status(403).json({ message: 'Only the organizer or an attendee can update this meeting\'s status' });
    }

    const wasCompleted = meeting.status === 'Completed';
    meeting.status = status;
    if (status === 'Completed' && !wasCompleted) {
      meeting.completedAt = new Date();
      meeting.completedBy = req.user._id as any;
    }
    await meeting.save();

    if (status === 'Completed' && !wasCompleted) {
      const recipients = [meeting.organizerId, ...meeting.attendeeIds]
        .filter((uid: any) => String(uid) !== String(req.user!._id));
      const uniqueRecipients = [...new Set(recipients.map((uid: any) => String(uid)))];
      await Promise.all(uniqueRecipients.map((uid) => notifyUser(
        tenantId,
        uid,
        req.user!._id,
        'Meeting Completed',
        `"${meeting.title}" has been marked completed by ${req.user!.firstName}.`,
        `/dashboard/meetings/${meeting._id}/mom`,
      )));
    }

    await AuditLog.create({
      tenantId,
      userId: req.user._id,
      action: 'UPDATE_MEETING_STATUS',
      module: 'Meetings',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { meetingId: meeting._id, status },
    } as any);

    res.status(200).json({ message: 'Meeting status updated', meeting });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating meeting status', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

/**
 * Meeting MoM: human-written minutes only for now — AI-drafted MoM is deferred
 * to after Phase C's AI infra exists, per docs/modules/31_MEETINGS_AND_COMMUNICATIONS.md.
 */
export const upsertMoM = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { id: meetingId } = req.params;
    const { content, attendeesPresent, actionItems } = req.body;
    if (!content) return res.status(400).json({ message: 'Content is required' });

    const meeting = await Meeting.findOne({ _id: meetingId, tenantId } as any);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (!isMeetingParticipant(meeting, String(req.user._id))) {
      return res.status(403).json({ message: 'Only the organizer or an attendee can record MoM' });
    }

    const existingMom = await MeetingMoM.findOne({ meetingId, tenantId } as any).select('actionItems').lean();
    const previouslyAssigned = new Set(
      ((existingMom as any)?.actionItems || []).map((item: any) => String(item.assignedTo)).filter(Boolean)
    );

    const mom = await MeetingMoM.findOneAndUpdate(
      { meetingId, tenantId } as any,
      {
        $set: {
          tenantId,
          meetingId,
          content,
          attendeesPresent: attendeesPresent || [],
          actionItems: actionItems || [],
          createdBy: req.user._id,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    // Only notify assignees who are NEW on this save, not on every re-save of the same MoM.
    const newlyAssigned = [...new Set(
      (actionItems || []).map((item: any) => item.assignedTo).filter(Boolean).map(String)
    )].filter((uid) => !previouslyAssigned.has(uid) && uid !== String(req.user!._id));
    await Promise.all(newlyAssigned.map((uid) => notifyUser(
      tenantId,
      uid,
      req.user!._id,
      'Meeting Action Item Assigned',
      `${req.user!.firstName} assigned you an action item from "${(meeting as any).title}".`,
      `/dashboard/meetings/${meetingId}/mom`,
    )));

    await AuditLog.create({
      tenantId,
      userId: req.user._id,
      action: 'RECORD_MOM',
      module: 'Meetings',
      status: 'SUCCESS',
      ipAddress: req.ip as string,
      userAgent: req.headers['user-agent'] as string,
      details: { meetingId },
    } as any);

    res.status(200).json({ message: 'MoM saved', mom });
  } catch (error: any) {
    res.status(500).json({ message: 'Error saving MoM', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMoM = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId || !req.user) return res.status(400).json({ message: 'Tenant ID required' });

    const { id: meetingId } = req.params;
    const meeting = await Meeting.findOne({ _id: meetingId, tenantId } as any);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (!isMeetingParticipant(meeting, String(req.user._id))) {
      return res.status(403).json({ message: 'Only the organizer or an attendee can view MoM' });
    }

    const mom = await MeetingMoM.findOne({ meetingId, tenantId } as any)
      .populate('attendeesPresent', 'firstName lastName email')
      .populate('actionItems.assignedTo', 'firstName lastName email');

    res.status(200).json(mom || null);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching MoM', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};
