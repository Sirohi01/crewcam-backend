require('dotenv').config();
const mongoose = require('mongoose');
const { createMasterDataModel } = require('./src/models/masterDataBase');
const Policy = createMasterDataModel('Policy', 'policies');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM').then(async () => {
  const policies = [
    {code: 'COC', description: 'This policy outlines the expected behavior, ethical standards, and professional conduct for all employees. It covers anti-corruption, conflict of interest, intellectual property protection, and workplace etiquette. Employees are required to read, understand, and comply with these guidelines at all times to maintain a respectful and legally compliant work environment.'},
    {code: 'LEAVE', description: 'Comprehensive guidelines on employee time-off, including Casual Leave (CL), Sick Leave (SL), Earned Leave (EL), and Maternity/Paternity Leave. It details the accrual process, carry-forward rules, approval hierarchies, and documentation required for extended medical leaves.'},
    {code: 'WFH', description: 'Provides a structured framework for remote work, detailing eligibility criteria, required internet bandwidth, core working hours, and communication expectations. It also covers the reimbursement for home office setups and data security protocols when accessing company networks remotely.'},
    {code: 'IT_SEC', description: 'Mandates the acceptable use of company-provided hardware (laptops, phones) and software. It strictly prohibits unauthorized software installation, details password rotation policies, multi-factor authentication requirements, and guidelines for reporting security incidents or data breaches.'},
    {code: 'POSH', description: 'A strict zero-tolerance policy establishing a safe and secure workplace free from sexual harassment. It defines what constitutes harassment, the process for filing complaints with the Internal Complaints Committee (ICC), confidentiality guarantees, and disciplinary actions for offenders.'},
    {code: 'TRAVEL', description: 'Outlines the rules for business travel, including flight and hotel booking classes, per-diem food allowances, and local conveyance limits. It provides clear instructions on the timeline and process for submitting expense claims with necessary receipts through the internal portal.'},
    {code: 'PERF', description: 'Details the annual and mid-year appraisal cycle, goal-setting framework (OKRs/KPIs), continuous feedback mechanisms, and the promotion criteria. It links individual performance to company goals and outlines the Performance Improvement Plan (PIP) process for underperformers.'},
    {code: 'REFERRAL', description: 'Encourages current employees to refer qualified candidates for open positions. It specifies the referral bonus amounts based on the level of the open role, eligibility conditions, and the timeline for bonus payout (usually after the referred candidate completes their probation period).'},
    {code: 'EXIT', description: 'Provides the standard operating procedure for voluntary and involuntary terminations. It includes notice period requirements, the handover process, exit interviews, IT asset return checklists, and the timeline for the Full and Final (F&F) settlement.'},
    {code: 'PRIVACY', description: 'Governs the collection, storage, processing, and deletion of personal data of employees, clients, and vendors. It ensures compliance with global data protection regulations and mandates strict access controls and data encryption standards.'}
  ];

  for(let p of policies) {
    await Policy.findOneAndUpdate(
      { code: p.code, tenantId: '6a31399a1c1b47795025af22' },
      { $set: { description: p.description } }
    );
  }
  console.log('Policy Descriptions Updated!');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
