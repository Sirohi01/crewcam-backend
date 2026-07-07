import { RoleCategory } from '../models/Role';

export interface SidebarDefaultItem {
  section: string;
  label: string;
  href: string;
  icon: string;
  order: number;
  parent?: string;
  requiredPermission?: string;
  requiredFeature?: string;
  categories: RoleCategory[];
}

const ALL: RoleCategory[] = [
  'employee', 'reporting_manager', 'hod', 'hr', 'hr_admin', 'finance', 'admin', 'company_admin', 'developer',
];
const HR_TEAM: RoleCategory[] = ['hr', 'hr_admin', 'company_admin'];
const HR_AND_HOD: RoleCategory[] = ['hr', 'hr_admin', 'hod', 'company_admin'];
const FINANCE_TEAM: RoleCategory[] = ['finance', 'hr_admin', 'company_admin'];

const comingSoon = (feature: string, section: string) =>
  `/dashboard/coming-soon?feature=${encodeURIComponent(feature)}&module=${encodeURIComponent(section)}`;

/** Steps 2-24 of docs/hiring/10_HIRING_24_STEP_BLUEPRINT.md — step 1 is the candidate pipeline page itself. */
const HIRING_STEPS = [
  ['Step 2 - Interview Evaluation Sheet', 'evaluation'], ['Step 3 - Selection Approval Note', 'selection-approval'],
  ['Step 4 - CTC Breakup', 'ctc-breakup'], ['Step 5 - Letter of Intent (LOI)', 'loi'],
  ['Step 6 - Joining Confirmation Mail', 'joining-confirmation'], ['Step 7 - Document Checklist', 'doc-checklist'],
  ['Step 8 - BGV Request Form & BGV Report', 'bgv'], ['Step 9 - Employee Joining Form', 'joining-form'],
  ['Step 10 - Nomination Form', 'nomination'], ['Step 11 - Bank & Payroll Information Form', 'bank-payroll'],
  ['Step 12 - Emergency Contact Details Form', 'emergency-contact'], ['Step 13 - Offer Letter', 'offer-letter'],
  ['Step 14 - NDA', 'nda'], ['Step 15 - IT Policy & IT Acceptance Form', 'it-policy-accept'],
  ['Step 16 - Code of Conduct Acceptance', 'code-of-conduct-accept'], ['Step 17 - Appointment Letter', 'appointment-letter'],
  ['Step 18 - IT Assets IT Access Stationery Form', 'asset-access'], ['Step 19 - Engagement Confirmation Form', 'engagement-confirm'],
  ['Step 20 - Induction Form', 'induction'], ['Step 21 - Team Introduction Note', 'team-intro'],
  ['Step 22 - Probation Review Form', 'probation-review'], ['Step 23 - Employee Performance Evaluation Sheet', 'perf-eval'],
  ['Step 24 - Visiting Card / Id Card', 'id-card'],
] as const;

/** docs/modules/37_ADMIN_MASTER_DATA_GAP_ANALYSIS.md — every "Add X" item from the Admin Section menu. */
const ADMIN_MASTER_DATA_ITEMS = [
  'Add KRA', 'Add JD', 'Add KPI', 'Add Brand/Page', 'Add Individual Target', 'Daily Statistics',
  'Add Question Paper', 'Add Mobile Services', 'Add Service Provider', 'Add Internet Provider',
  'Add Water Provider', 'Add electricity Provider', 'Add Credit Card Provider', 'Add Branch',
  'Add Crewcam Users', 'Add Status', 'Add leave Name', 'Add Nature of leave', 'Add IT Inventory',
  'Add stationary', 'Add Degree', 'Add Marks', 'Add Official Email', 'Add Department',
  'Add Relaxation Rule', 'Add Attendance Rule', 'Expense Head', 'Add Designation', 'Add Specialization',
  'Add Office Holiday', 'Add Option Question', 'Add Bank Name', 'Add Marks Limit', 'Add Levels',
  'Add Subjects', 'Add Policies',
];
const BUILT_MASTER_DATA = new Set([
  'Add Question Paper', 'Add Mobile Services', 'Add Service Provider', 'Add Status', 'Add leave Name',
  'Add Nature of leave', 'Add IT Inventory', 'Add stationary', 'Add Degree', 'Add Marks',
  'Add Relaxation Rule', 'Add Attendance Rule', 'Expense Head', 'Add Office Holiday',
  'Add Option Question', 'Add Bank Name', 'Add Levels', 'Add Subjects', 'Add Policies',
  'Add JD', 'Add KRA',
]);

const ORGANIZATION_ITEMS = new Set(['Add Branch', 'Add Department', 'Add Designation']);

export const DEFAULT_SIDEBAR_ITEMS: SidebarDefaultItem[] = [
  { section: 'Workspace', label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', order: 0, categories: ALL },

  // ---- Company Setup ----
  { section: 'Company Setup', label: 'Company Profile', href: '/dashboard/settings/company', icon: 'UserCog', order: 0, requiredPermission: 'COMPANY_PROFILE_READ', categories: ['company_admin', 'hr_admin'] },
  { section: 'Company Setup', label: 'Manage Branch', href: '/dashboard/branches', icon: 'Building2', order: 1, requiredPermission: 'ORG_READ', categories: ['hr_admin', 'admin', 'company_admin'] },
  { section: 'Company Setup', label: 'Manage Department', href: '/dashboard/departments', icon: 'ListTree', order: 2, requiredPermission: 'ORG_READ', categories: ['hr_admin', 'admin', 'company_admin'] },
  { section: 'Company Setup', label: 'Manage Designation', href: '/dashboard/designations', icon: 'Briefcase', order: 3, requiredPermission: 'ORG_READ', categories: ['hr_admin', 'admin', 'company_admin'] },
  { section: 'Company Setup', label: 'Manage Roles', href: '/dashboard/roles', icon: 'KeyRound', order: 4, requiredPermission: 'ORG_READ', categories: ['hr_admin', 'admin', 'company_admin'] },
  ...[
    ['Job Levels', 'levels'], ['Statuses', 'statuses'], ['Policies', 'policies'],
    ['Leave Types', 'leave-types'], ['Leave Natures', 'leave-natures'], ['Attendance Rules', 'attendance-rules'],
    ['Relaxation Rules', 'relaxation-rules'], ['Degrees', 'degrees'], ['Marks / Grades', 'marks'],
    ['Subjects', 'subjects'], ['Bank Names', 'bank-names'], ['Expense Heads', 'expense-heads'],
    ['Holidays', 'holidays'], ['IT Inventory', 'it-inventories'], ['Stationery', 'stationeries'],
    ['Providers', 'providers'], ['Brands', 'brands'], ['Services', 'services'],
    ['Mobile Services', 'mobile-services'], ['Utility Providers', 'utility-providers'],
    ['Question Papers', 'question-papers'], ['Option Questions', 'option-questions'],
    ['Shift Timings', 'shift-timings'], ['JD Library', 'jd-library'], ['KPA Library', 'kpa-library']
  ].map(([label, endpointKey], i) => ({
    section: 'Company Setup',
    label: label as string,
    href: `/dashboard/master/${endpointKey}`,
    icon: 'Circle',
    order: i + 5,
    parent: 'Master Data',
    requiredPermission: 'MASTER_READ',
    categories: ['hr_admin', 'admin', 'company_admin'] as RoleCategory[],
  })),
  // Company Assets lives on its own page (with allocation tracking) rather than the
  // generic master-data CRUD list, so it can't join the .map() above — same Master Data
  // grouping and href as the existing Support & Operations > Asset Management entry.
  { section: 'Company Setup', label: 'Company Assets', href: '/dashboard/support/assets', icon: 'Briefcase', order: 29, parent: 'Master Data', requiredPermission: 'SUPPORT_READ', categories: ['hr_admin', 'admin', 'company_admin', 'developer'] },

  // ---- People ----
  { section: 'People', label: 'Employees', href: '/dashboard/employees', icon: 'Users', order: 0, requiredPermission: 'EMPLOYEE_READ', categories: ['hr', 'hr_admin', 'admin', 'company_admin', 'hod', 'reporting_manager'] },
  { section: 'People', label: 'HR Admin', href: '/dashboard/hr-admin', icon: 'Scale', order: 1, requiredPermission: 'ORG_READ', categories: HR_TEAM },

  // ---- Attendance Section ----
  { section: 'Attendance Section', label: 'My Attendance', href: '/dashboard/attendance', icon: 'Fingerprint', order: 0, categories: ALL },
  { section: 'Attendance Section', label: 'Short Excursions', href: '/dashboard/out-in', icon: 'LogOut', order: 1, categories: ALL },
  { section: 'Attendance Section', label: 'HR Override', href: '/dashboard/hr-override', icon: 'Clock', order: 2, categories: HR_TEAM },
  { section: 'Attendance Section', label: 'Leave Statistics', href: '/dashboard/leave-statistics', icon: 'TrendingUp', order: 3, categories: HR_AND_HOD.concat('reporting_manager') },
  { section: 'Attendance Section', label: 'Leaves', href: '/dashboard/leaves', icon: 'Calendar', order: 4, categories: ALL },
  { section: 'Attendance Section', label: 'Leave Credit', href: '/dashboard/leave-credit', icon: 'CalendarDays', order: 5, categories: HR_TEAM },
  { section: 'Attendance Section', label: 'Employee Live Tracking', href: '/dashboard/live-tracking', icon: 'MapPin', order: 6, requiredFeature: 'liveTracking', categories: ['hod', 'reporting_manager', 'admin', 'company_admin'] },
  { section: 'Attendance Section', label: 'To Do List', href: '/dashboard/todos', icon: 'ListTodo', order: 7, categories: ALL },

  { section: 'Meeting Section', label: 'Meetings', href: '/dashboard/meetings', icon: 'Calendar', order: 0, categories: ALL },

  // ---- Communications ----
  { section: 'Communications', label: 'Add HR Notification', href: '/dashboard/communication', icon: 'MessageSquare', order: 0, categories: HR_TEAM },
  { section: 'Communications', label: 'Add Daily Quotes', href: '/dashboard/daily-quotes', icon: 'MessageSquare', order: 1, categories: HR_TEAM },
  { section: 'Communications', label: 'Employee Queries', href: '/dashboard/queries', icon: 'MessageSquare', order: 2, categories: ALL },

  // ---- HR & Admin Department ----
  // "Current Employee List" used to duplicate People > Employees (same href) — removed,
  // per explicit user request to drop same-page-different-name sidebar entries.
  { section: 'HR & Admin Department', label: 'Ex-Employees', href: comingSoon('Ex-Employees', 'HR & Admin Department'), icon: 'Users', order: 1, categories: HR_TEAM },
  { section: 'HR & Admin Department', label: 'Imprest Account', href: comingSoon('Imprest Account', 'HR & Admin Department'), icon: 'Wallet', order: 2, categories: FINANCE_TEAM },
  { section: 'HR & Admin Department', label: 'Confirmation Letter', href: comingSoon('Confirmation Letter', 'HR & Admin Department'), icon: 'FileSignature', order: 3, categories: HR_TEAM },
  { section: 'HR & Admin Department', label: 'Extension Probation Period Letter', href: comingSoon('Extension Probation Period Letter', 'HR & Admin Department'), icon: 'FileSignature', order: 4, categories: HR_TEAM },
  { section: 'HR & Admin Department', label: 'Provident Funds', href: comingSoon('Provident Funds', 'HR & Admin Department'), icon: 'IndianRupee', order: 5, categories: FINANCE_TEAM },
  { section: 'HR & Admin Department', label: 'Employees State Insurance', href: comingSoon('Employees State Insurance', 'HR & Admin Department'), icon: 'IndianRupee', order: 6, categories: FINANCE_TEAM },
  { section: 'HR & Admin Department', label: 'Employee Gratuity', href: comingSoon('Employee Gratuity', 'HR & Admin Department'), icon: 'IndianRupee', order: 7, categories: FINANCE_TEAM },
  { section: 'HR & Admin Department', label: 'TDS Deduction', href: comingSoon('TDS Deduction', 'HR & Admin Department'), icon: 'IndianRupee', order: 8, categories: FINANCE_TEAM },
  { section: 'HR & Admin Department', label: 'Salary Deduction', href: comingSoon('Salary Deduction', 'HR & Admin Department'), icon: 'IndianRupee', order: 9, categories: FINANCE_TEAM },
  { section: 'HR & Admin Department', label: 'Written Warning/Memo', href: comingSoon('Written Warning/Memo', 'HR & Admin Department'), icon: 'Scale', order: 10, categories: HR_AND_HOD },
  { section: 'HR & Admin Department', label: 'Suspension', href: comingSoon('Suspension', 'HR & Admin Department'), icon: 'Scale', order: 11, categories: HR_TEAM },
  { section: 'HR & Admin Department', label: 'Demotion', href: comingSoon('Demotion', 'HR & Admin Department'), icon: 'Scale', order: 12, categories: HR_TEAM },
  { section: 'HR & Admin Department', label: 'Termination', href: comingSoon('Termination', 'HR & Admin Department'), icon: 'Scale', order: 13, categories: HR_TEAM },
  { section: 'HR & Admin Department', label: 'Legal Action', href: comingSoon('Legal Action', 'HR & Admin Department'), icon: 'Scale', order: 14, categories: HR_TEAM },
  { section: 'HR & Admin Department', label: 'Exit Interview', href: comingSoon('Exit Interview', 'HR & Admin Department'), icon: 'UserCog', order: 15, categories: HR_TEAM },
  { section: 'HR & Admin Department', label: 'No Dues Formalities', href: comingSoon('No Dues Formalities', 'HR & Admin Department'), icon: 'UserCog', order: 16, categories: HR_TEAM },
  { section: 'HR & Admin Department', label: 'Experience Letter', href: comingSoon('Experience Letter', 'HR & Admin Department'), icon: 'FileSignature', order: 17, categories: HR_TEAM },

  // ---- PMS System ----
  { section: 'PMS System', label: 'Self Appraisal', href: '/dashboard/pms', icon: 'TrendingUp', order: 0, categories: ALL },
  { section: 'PMS System', label: 'Appraisal By HOD', href: comingSoon('Appraisal By HOD', 'PMS System'), icon: 'TrendingUp', order: 1, categories: ['hod', 'company_admin'] },
  { section: 'PMS System', label: 'Appraisal By HR', href: comingSoon('Appraisal By HR', 'PMS System'), icon: 'TrendingUp', order: 2, categories: HR_TEAM },
  { section: 'PMS System', label: 'Appraisal Statistics', href: comingSoon('Appraisal Statistics', 'PMS System'), icon: 'TrendingUp', order: 3, categories: HR_TEAM },

  // ---- Hiring Process (24 steps + Interview & Selection grouped in, not a separate top-level
  // section — both operate on the same candidate pipeline, splitting them into two sidebar
  // sections just duplicated the mental model for no reason; per explicit user request) ----
  // Actual operating sequence: requisition -> candidate intake -> resume screening ->
  // interviews -> evaluation (Step 2) -> the remaining offer/onboarding steps.
  { section: 'Hiring Process', label: 'Recruiter Dashboard', href: '/dashboard/hr-dashboard', icon: 'LayoutDashboard', order: -1, requiredPermission: 'ATS_READ', categories: HR_AND_HOD },
  { section: 'Hiring Process', label: 'Job Requisition', href: '/dashboard/hiring/manpower', icon: 'ClipboardList', order: 0, requiredPermission: 'ATS_READ', categories: HR_AND_HOD },
  { section: 'Hiring Process', label: 'Add Candidate', href: '/dashboard/hiring/candidates', icon: 'UserPlus', order: 1, requiredPermission: 'ATS_WRITE', categories: HR_AND_HOD },
  { section: 'Hiring Process', label: 'Candidate Pipeline', href: '/dashboard/hiring/pipeline', icon: 'UserPlus', order: 2, requiredPermission: 'ATS_READ', categories: HR_AND_HOD },
  { section: 'Hiring Process', label: 'AI Resume Screening', href: '/dashboard/hiring/ai-resume-screening', icon: 'Sparkles', order: 3, requiredPermission: 'ATS_READ', requiredFeature: 'ai-hiring', categories: HR_AND_HOD },
  { section: 'Hiring Process', label: 'Interviews', href: '/dashboard/hiring/interviews/list', icon: 'UserPlus', order: 4, requiredPermission: 'ATS_READ', categories: HR_AND_HOD },
  { section: 'Hiring Process', label: 'Level 1-Walk-In Round', href: '/dashboard/hiring/interviews/walk-in', icon: 'UserPlus', order: 6, requiredPermission: 'ATS_READ', categories: HR_AND_HOD },
  { section: 'Hiring Process', label: 'Level 1-Telephonic Round', href: '/dashboard/hiring/interviews/telephonic', icon: 'UserPlus', order: 7, requiredPermission: 'ATS_READ', categories: HR_AND_HOD },
  { section: 'Hiring Process', label: 'Level 2-HR and HOD Round', href: '/dashboard/hiring/interviews/hr-hod', icon: 'UserPlus', order: 8, requiredPermission: 'ATS_READ', categories: HR_AND_HOD },
  { section: 'Hiring Process', label: 'Level 3-HR Final Round', href: '/dashboard/hiring/interviews/final', icon: 'UserPlus', order: 9, requiredPermission: 'ATS_READ', categories: HR_TEAM },
  { section: 'Hiring Process', label: 'Interview Statistics', href: '/dashboard/hiring/interviews/statistics', icon: 'TrendingUp', order: 10, requiredPermission: 'ATS_READ', categories: HR_TEAM },
  ...HIRING_STEPS.map(([label, stepId], i) => ({
    section: 'Hiring Process',
    label,
    href: `/dashboard/hiring/steps/${stepId}`,
    icon: 'UserPlus',
    order: i + 11,
    requiredPermission: 'ATS_READ',
    categories: HR_AND_HOD,
  })),

  // ---- Accounts Department ----
  { section: 'Accounts Department', label: 'Incentive List', href: comingSoon('Incentive List', 'Accounts Department'), icon: 'IndianRupee', order: 0, categories: FINANCE_TEAM },
  { section: 'Accounts Department', label: 'Salary Advances List', href: comingSoon('Salary Advances List', 'Accounts Department'), icon: 'IndianRupee', order: 1, categories: FINANCE_TEAM },
  { section: 'Accounts Department', label: 'Conveyance List', href: comingSoon('Conveyance List', 'Accounts Department'), icon: 'Receipt', order: 2, categories: FINANCE_TEAM },
  { section: 'Accounts Department', label: 'Salary Deduction List', href: comingSoon('Salary Deduction List', 'Accounts Department'), icon: 'IndianRupee', order: 3, categories: FINANCE_TEAM },
  { section: 'Accounts Department', label: 'Personal Loan List', href: comingSoon('Personal Loan List', 'Accounts Department'), icon: 'IndianRupee', order: 4, categories: FINANCE_TEAM },
  // "Employee Salary Slips" used to duplicate Finance & Legal > Payroll & Slips (same
  // href) — removed; that entry's categories were widened to ALL below so every persona
  // keeps self-view access to their own payslip that this row used to provide.
  { section: 'Accounts Department', label: 'PF Returns', href: comingSoon('PF Returns', 'Accounts Department'), icon: 'IndianRupee', order: 6, categories: FINANCE_TEAM },
  { section: 'Accounts Department', label: 'Generate Salary', href: comingSoon('Generate Salary', 'Accounts Department'), icon: 'IndianRupee', order: 7, categories: ['finance', 'company_admin'] },
  { section: 'Accounts Department', label: 'Salary Structure', href: comingSoon('Salary Structure', 'Accounts Department'), icon: 'IndianRupee', order: 8, categories: ['finance', 'company_admin'] },
  { section: 'Accounts Department', label: 'Payment Sheet - Office', href: comingSoon('Payment Sheet - Office', 'Accounts Department'), icon: 'Receipt', order: 9, categories: ['finance', 'company_admin'] },
  { section: 'Accounts Department', label: 'Payment Sheet - Production', href: comingSoon('Payment Sheet - Production', 'Accounts Department'), icon: 'Receipt', order: 10, categories: ['finance', 'company_admin'] },
  { section: 'Accounts Department', label: 'EPF Payment', href: comingSoon('EPF Payment', 'Accounts Department'), icon: 'Receipt', order: 11, categories: ['finance', 'company_admin'] },
  { section: 'Accounts Department', label: 'ESI Payment', href: comingSoon('ESI Payment', 'Accounts Department'), icon: 'Receipt', order: 12, categories: ['finance', 'company_admin'] },
  { section: 'Accounts Department', label: 'Imprest Ledger', href: comingSoon('Imprest Ledger', 'Accounts Department'), icon: 'Wallet', order: 13, categories: ['finance', 'company_admin'] },
  { section: 'Accounts Department', label: 'Salary Ledger', href: comingSoon('Salary Ledger', 'Accounts Department'), icon: 'Wallet', order: 14, categories: ['finance', 'company_admin'] },

  // ---- Agreement Section ----
  { section: 'Agreement Section', label: 'Create MOU', href: comingSoon('Create MOU', 'Agreement Section'), icon: 'FileSignature', order: 1, categories: ['finance', 'company_admin'] },
  { section: 'Agreement Section', label: 'Create J V', href: comingSoon('Create J V', 'Agreement Section'), icon: 'FileSignature', order: 2, categories: ['finance', 'company_admin'] },
  { section: 'Agreement Section', label: 'Create Rent Agreement', href: comingSoon('Create Rent Agreement', 'Agreement Section'), icon: 'FileSignature', order: 3, categories: ['finance', 'company_admin'] },

  // ---- PYMT Obligation ----
  { section: 'PYMT Obligation', label: 'Monthly Obligation', href: comingSoon('Monthly Obligation', 'PYMT Obligation'), icon: 'Receipt', order: 0, categories: ['finance', 'company_admin'] },
  { section: 'PYMT Obligation', label: 'Yearly Obligation', href: comingSoon('Yearly Obligation', 'PYMT Obligation'), icon: 'Receipt', order: 1, categories: ['finance', 'company_admin'] },
  { section: 'PYMT Obligation', label: 'Tax Obligations PYMT', href: comingSoon('Tax Obligations PYMT', 'PYMT Obligation'), icon: 'Receipt', order: 2, categories: ['finance', 'company_admin'] },
  { section: 'PYMT Obligation', label: 'Add Monthly Obligations', href: comingSoon('Add Monthly Obligations', 'PYMT Obligation'), icon: 'Receipt', order: 3, categories: ['finance', 'company_admin'] },
  { section: 'PYMT Obligation', label: 'Add Yearly Obligations', href: comingSoon('Add Yearly Obligations', 'PYMT Obligation'), icon: 'Receipt', order: 4, categories: ['finance', 'company_admin'] },
  { section: 'PYMT Obligation', label: 'Add Tax Obligations', href: comingSoon('Add Tax Obligations', 'PYMT Obligation'), icon: 'Receipt', order: 5, categories: ['finance', 'company_admin'] },

  // ---- Developer Department ----
  { section: 'Developer Department', label: 'Developer Section', href: comingSoon('Developer Section', 'Developer Department'), icon: 'Briefcase', order: 0, categories: ['developer', 'company_admin'] },
  { section: 'Developer Department', label: 'Interview Section', href: comingSoon('Interview Section', 'Developer Department'), icon: 'UserPlus', order: 1, categories: ['developer', 'company_admin'] },

  // ---- Support & Operations ----
  // Asset Management used to live here, but it's the exact same page as Company Setup >
  // Master Data > Company Assets (added so Assets sits alongside the other master-data
  // catalogs) — per explicit user request, dropped here to avoid a same-page duplicate.
  { section: 'Support & Operations', label: 'Helpdesk & IT', href: '/dashboard/support/helpdesk', icon: 'MessageSquare', order: 1, requiredPermission: 'SUPPORT_READ', categories: ALL },
  { section: 'Support & Operations', label: 'Learning (LMS)', href: '/dashboard/support/lms', icon: 'Palette', order: 2, requiredPermission: 'SUPPORT_READ', categories: ALL },

  // ---- Sidebar Section ----
  { section: 'Sidebar Section', label: 'Side Bar List', href: '/dashboard/settings/sidebar', icon: 'ListTree', order: 0, requiredPermission: 'ROLE_ADMIN', categories: ['company_admin', 'hr_admin'] },
  { section: 'Sidebar Section', label: 'User Role', href: '/dashboard/settings/roles', icon: 'ShieldCheck', order: 1, requiredPermission: 'ROLE_ADMIN', categories: ['company_admin', 'hr_admin'] },

  // ---- Admin Section ----
  { section: 'Admin Section', label: 'Activity Logs', href: comingSoon('Activity Logs', 'Admin Section'), icon: 'Shield', order: 0, categories: ['company_admin', 'hr_admin', 'admin'] },
  { section: 'Admin Section', label: 'Manage Admin Users', href: comingSoon('Manage Admin Users', 'Admin Section'), icon: 'UserCog', order: 1, categories: ['company_admin'] },
  // Items already built route to Organization ("Add Branch" etc.) or Master Data ("Add
  // Question Paper" etc.) — both already have their own single sidebar entry under
  // "Company Setup" above. Listing them again here would just be N extra rows that all
  // open the exact same page, so only the genuinely still-unbuilt items get a row (per
  // explicit user request to keep the sidebar from ballooning with same-destination duplicates).
  ...ADMIN_MASTER_DATA_ITEMS.filter((label) => !ORGANIZATION_ITEMS.has(label) && !BUILT_MASTER_DATA.has(label)).map((label, i) => ({
    section: 'Admin Section',
    label,
    href: comingSoon(label, 'Admin Section'),
    icon: 'Briefcase',
    order: i + 2,
    categories: ['hr_admin', 'admin', 'company_admin'] as RoleCategory[],
  })),

  // ---- Finance & Legal (overview pages, kept from the existing build) ----
  { section: 'Finance & Legal', label: 'Payroll & Slips', href: '/dashboard/finance/payroll', icon: 'IndianRupee', order: 0, categories: ALL },
  { section: 'Finance & Legal', label: 'Expenses', href: '/dashboard/finance/expenses', icon: 'Receipt', order: 1, requiredPermission: 'FINANCE_READ', categories: FINANCE_TEAM.concat('employee') },

  // ---- Admin UI ----
  { section: 'Admin UI', label: 'Integrations', href: '/dashboard/settings/integrations', icon: 'Plug', order: 0, requiredFeature: 'integrations', categories: ['company_admin'] },
  { section: 'Admin UI', label: 'Whitelabel', href: '/dashboard/settings/whitelabel', icon: 'Palette', order: 1, requiredFeature: 'whitelabel', categories: ['company_admin'] },
  { section: 'Admin UI', label: 'Active Sessions', href: '/dashboard/settings/sessions', icon: 'Shield', order: 2, categories: ALL },
  { section: 'Admin UI', label: 'Security (2FA)', href: '/dashboard/settings/security', icon: 'Shield', order: 3, categories: ALL },

  // ---- Career Growth ----
  { section: 'Career Growth', label: 'Training & Development', href: '/dashboard/training-development', icon: 'GraduationCap', order: 0, categories: ALL },
  { section: 'Career Growth', label: 'Career Progression & Promotion', href: '/dashboard/career-progression', icon: 'TrendingUp', order: 1, categories: ALL },
  { section: 'Career Growth', label: 'AI Career Coach', href: '/dashboard/ai-career-coach', icon: 'Sparkles', order: 2, categories: ALL },

  // ---- Account (employee-facing settings hub, last item in the sidebar for every role) ----
  { section: 'Account', label: 'Settings', href: '/dashboard/settings', icon: 'Settings', order: 0, categories: ALL },
];

/**
 * Section display order, derived from each section's first appearance above
 * (Workspace/Dashboard first, by design). Sorting the DB query alphabetically by
 * `section` string would put "Admin UI" before "Workspace" — this map is what
 * lets the sidebar render sections in the intended order instead.
 */
export const SECTION_ORDER: Record<string, number> = {};
DEFAULT_SIDEBAR_ITEMS.forEach((item) => {
  if (!(item.section in SECTION_ORDER)) {
    SECTION_ORDER[item.section] = Object.keys(SECTION_ORDER).length;
  }
});
