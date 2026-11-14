import { Types } from 'mongoose';

/**
 * Which notifications a user may see: company-wide ones, ones aimed at their role,
 * department or branch, and ones sent to them directly. Every read and "mark read"
 * goes through this filter, so nobody can open (or mark) a colleague's direct message
 * by guessing its ID.
 */
export const myNotificationFilter = (tenantId: unknown, user: any) => ({
  tenantId,
  $or: [
    { audienceType: 'All' },
    { audienceType: 'Role', audienceValue: user.roleId },
    { audienceType: 'Department', audienceValue: user.departmentId },
    { audienceType: 'Branch', audienceValue: user.branchId },
    { audienceType: 'User', audienceValue: user._id },
  ],
});

/** Client shape: `isRead` for this user instead of the list of everyone who read it. */
export const toMyNotification = (doc: any, userId: Types.ObjectId | string) => {
  const n = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const { readBy, audienceValue, createdBy, ...rest } = n;
  return {
    ...rest,
    priority: n.priority || 'Normal',
    isDirect: n.audienceType === 'User',
    isRead: (readBy || []).some((id: unknown) => String(id) === String(userId)),
  };
};
