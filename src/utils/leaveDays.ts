import moment from 'moment';

/** Days a leave request consumes: 0.5 for a half day, otherwise calendar days inclusive. */
export const leaveDays = (request: { startDate: Date; endDate: Date; isHalfDay?: boolean }) =>
  request.isHalfDay ? 0.5 : moment(request.endDate).diff(moment(request.startDate), 'days') + 1;
