require('dotenv').config();
const mongoose = require('mongoose');
const { createMasterDataModel } = require('./src/models/masterDataBase');
const LeaveNature = createMasterDataModel('LeaveNature', 'leaveNatures');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM').then(async () => {
  const leaveNatures = [
    {name: 'Paid Leave', code: 'PAID', description: 'Leaves where the employee continues to receive their regular full salary during the time off (e.g., Casual Leave, Earned Leave).'},
    {name: 'Unpaid / Loss of Pay', code: 'UNPAID', description: 'Leaves where the employee\'s salary is proportionally deducted for the days taken off. Usually applied when no paid leave balances are available.'},
    {name: 'Compensatory', code: 'COMP', description: 'Time off granted in compensation for having worked on weekends, declared public holidays, or beyond regular working hours.'},
    {name: 'Statutory', code: 'STAT', description: 'Leaves that are strictly mandated by government laws and labor regulations (e.g., Maternity Leave, Paternity Leave).'},
    {name: 'Restricted / Optional', code: 'OPT', description: 'Optional holidays from a pre-defined list that an employee can choose to take based on their personal or religious preferences.'},
    {name: 'Special / Extraordinary', code: 'SPL', description: 'Leaves granted under special circumstances, often requiring higher managerial or HR approval (e.g., Bereavement, Sabbatical, Study Leave).'}
  ];

  for(let ln of leaveNatures) {
    await LeaveNature.findOneAndUpdate(
      { code: ln.code, tenantId: '6a31399a1c1b47795025af22' },
      { ...ln, tenantId: '6a31399a1c1b47795025af22', isActive: true, category: 'leave-natures' },
      { upsert: true }
    );
  }
  console.log('Leave Natures Seeded!');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
