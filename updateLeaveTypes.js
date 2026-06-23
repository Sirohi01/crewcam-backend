require('dotenv').config();
const mongoose = require('mongoose');
const LeaveType = require('./src/models/LeaveType').LeaveType;

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM').then(async () => {
  const leaveTypes = [
    {name: 'Casual Leave', code: 'CL', defaultDays: 12, description: 'Intended for unexpected personal matters or short-term emergencies. Typically accrued monthly, non-encashable, and lapses at the end of the calendar year.'},
    {name: 'Sick Leave', code: 'SL', defaultDays: 10, description: 'Provided for periods of illness or medical emergencies. A medical certificate is mandatory if the leave exceeds 3 consecutive days. Can be carried forward but not encashed.'},
    {name: 'Earned Leave', code: 'EL', defaultDays: 15, description: 'Planned time off accrued based on days worked. Must be applied for in advance. EL balances can be carried forward up to a maximum cap and are eligible for encashment during separation.'},
    {name: 'Maternity Leave', code: 'ML', defaultDays: 180, description: 'Granted to expecting female employees as per statutory regulations. Covers pre-natal and post-natal periods. Requires medical documentation.'},
    {name: 'Paternity Leave', code: 'PTL', defaultDays: 5, description: 'Granted to male employees upon the birth or adoption of a child. Must be utilized within 6 months of the childbirth to support the spouse and newborn.'},
    {name: 'Compensatory Off', code: 'COMP', defaultDays: 0, description: 'Earned by working on weekends or declared public holidays. Must be pre-approved by the manager and typically expires within 30 to 60 days if unutilized.'},
    {name: 'Loss of Pay / Unpaid', code: 'LOP', defaultDays: 0, description: 'Leave taken when no paid leave balance is available. Results in a proportional deduction of salary for the days availed. Subject to manager approval.'},
    {name: 'Bereavement Leave', code: 'BL', defaultDays: 3, description: 'Granted in the unfortunate event of the demise of an immediate family member (spouse, child, parent, or sibling) to allow time for grieving and arrangements.'}
  ];

  for(let lt of leaveTypes) {
    await LeaveType.findOneAndUpdate(
      { code: lt.code, tenantId: '6a31399a1c1b47795025af22' },
      { ...lt, tenantId: '6a31399a1c1b47795025af22', isActive: true, isPaid: lt.code !== 'LOP' },
      { upsert: true }
    );
  }
  
  // Clean up the mistakenly created collection
  await mongoose.connection.db.collection('leave-types').drop().catch(() => {});

  console.log('Leave Types Seeded!');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
