require('dotenv').config();
const mongoose = require('mongoose');

// Import all models dynamically to avoid import issues
const { createMasterDataModel } = require('./src/models/masterDataBase');

const models = {
  Degree: createMasterDataModel('Degree', 'degrees'),
  Mark: createMasterDataModel('Mark', 'marks'),
  Subject: createMasterDataModel('Subject', 'subjects'),
  AttendanceRule: createMasterDataModel('AttendanceRule', 'attendanceRules'),
  RelaxationRule: createMasterDataModel('RelaxationRule', 'relaxationRules'),
  BankName: createMasterDataModel('BankName', 'bankNames'),
  ExpenseHead: createMasterDataModel('ExpenseHead', 'expenseHeads'),
  Holiday: createMasterDataModel('Holiday', 'holidays'),
  ITInventory: createMasterDataModel('ITInventory', 'itInventories'),
  Stationery: createMasterDataModel('Stationery', 'stationeries'),
  Provider: createMasterDataModel('Provider', 'providers'),
  Brand: createMasterDataModel('Brand', 'brands'),
  Service: createMasterDataModel('Service', 'services'),
  MobileService: createMasterDataModel('MobileService', 'mobileServices'),
  UtilityProvider: createMasterDataModel('UtilityProvider', 'utilityProviders'),
  QuestionPaper: createMasterDataModel('QuestionPaper', 'questionPapers'),
  OptionQuestion: createMasterDataModel('OptionQuestion', 'optionQuestions'),
};

const tenantId = '6a31399a1c1b47795025af22';

const seedData = {
  Degree: [
    { name: 'B.Tech / B.E.', code: 'BTECH', level: 'UG' },
    { name: 'MBA / PGDM', code: 'MBA', level: 'PG' },
    { name: 'B.Com', code: 'BCOM', level: 'UG' },
    { name: 'M.Tech / M.E.', code: 'MTECH', level: 'PG' },
    { name: 'B.Sc Computer Science', code: 'BSC_CS', level: 'UG' },
    { name: 'MCA', code: 'MCA', level: 'PG' },
    { name: 'PhD', code: 'PHD', level: 'Doctorate' }
  ],
  Mark: [
    { name: 'First Class with Distinction', code: 'DIST', level: '1' },
    { name: 'First Class', code: 'FC', level: '2' },
    { name: 'Second Class', code: 'SC', level: '3' },
    { name: 'Pass Class', code: 'PASS', level: '4' },
    { name: 'CGPA 9.0+', code: 'CGPA9', level: '1' },
    { name: 'CGPA 8.0 - 8.9', code: 'CGPA8', level: '2' }
  ],
  Subject: [
    { name: 'Computer Science', code: 'CS', category: 'Engineering' },
    { name: 'Information Technology', code: 'IT', category: 'Engineering' },
    { name: 'Mechanical Engineering', code: 'ME', category: 'Engineering' },
    { name: 'Finance', code: 'FIN', category: 'Business' },
    { name: 'Human Resources', code: 'HR', category: 'Business' },
    { name: 'Marketing', code: 'MKT', category: 'Business' }
  ],
  AttendanceRule: [
    { name: 'Grace Period', code: 'GRACE_15', description: 'Employees are allowed a 15-minute grace period from their scheduled shift start time. Arrivals beyond this are marked as late.' },
    { name: 'Half Day Cutoff', code: 'HALF_DAY', description: 'Working for less than 4.5 hours in a single shift will automatically be logged as a Half Day.' },
    { name: 'Full Day Cutoff', code: 'FULL_DAY', description: 'A minimum of 8.5 hours (including break) must be logged to complete a full working day.' },
    { name: 'Overtime Eligibility', code: 'OT_ELIGIBLE', description: 'Hours logged beyond 9.5 hours in a day are eligible for overtime computation subject to manager approval.' },
    { name: 'Absenteeism', code: 'ABSENT', description: 'No check-in or approved leave by 12:00 PM will automatically mark the employee as Absent (Loss of Pay).' }
  ],
  RelaxationRule: [
    { name: 'Late Arrival Allowance', code: 'LATE_ALLOW', description: 'Employees are permitted up to 3 late arrivals (within 30 minutes) per calendar month without any salary deduction.' },
    { name: 'Emergency WFH', code: 'EMG_WFH', description: 'Employees can work from home up to 2 times a month for sudden emergencies without prior 24-hour notice.' },
    { name: 'Early Logout', code: 'EARLY_LOGOUT', description: 'Allowed to log out up to 1 hour early twice a month for personal emergencies with immediate manager intimation.' },
    { name: 'Compensatory Working', code: 'COMP_WORK', description: 'Late arrivals beyond the allowance can be compensated by working equal extra hours within the same week.' }
  ],
  BankName: [
    { name: 'HDFC Bank', code: 'HDFC' },
    { name: 'State Bank of India', code: 'SBI' },
    { name: 'ICICI Bank', code: 'ICICI' },
    { name: 'Axis Bank', code: 'AXIS' },
    { name: 'Kotak Mahindra Bank', code: 'KOTAK' },
    { name: 'Punjab National Bank', code: 'PNB' },
    { name: 'Bank of Baroda', code: 'BOB' },
    { name: 'IDFC First Bank', code: 'IDFC' }
  ],
  ExpenseHead: [
    { name: 'Air Travel', code: 'AIR_TRVL', category: 'Travel' },
    { name: 'Train / Bus Travel', code: 'TRAIN_TRVL', category: 'Travel' },
    { name: 'Hotel Accommodation', code: 'HOTEL', category: 'Accommodation' },
    { name: 'Food & Beverage', code: 'FNB', category: 'Meals' },
    { name: 'Local Cab / Auto', code: 'LOCAL_CAB', category: 'Conveyance' },
    { name: 'Internet / Telecom', code: 'INTERNET', category: 'Communication' },
    { name: 'Client Entertainment', code: 'CLIENT_ENT', category: 'Business' },
    { name: 'Office Supplies', code: 'SUPPLIES', category: 'Operations' }
  ],
  Holiday: [
    { name: "New Year's Day", code: 'NEW_YEAR', category: 'Observance' },
    { name: 'Republic Day', code: 'REPUBLIC', category: 'National' },
    { name: 'Holi', code: 'HOLI', category: 'Religious' },
    { name: 'Independence Day', code: 'INDEPENDENCE', category: 'National' },
    { name: 'Gandhi Jayanti', code: 'GANDHI', category: 'National' },
    { name: 'Diwali', code: 'DIWALI', category: 'Religious' },
    { name: 'Christmas', code: 'CHRISTMAS', category: 'Religious' },
    { name: 'Eid al-Fitr', code: 'EID', category: 'Religious' }
  ],
  ITInventory: [
    { name: 'Laptop - High Performance', code: 'LAP_PRO', category: 'Computers' },
    { name: 'Laptop - Standard', code: 'LAP_STD', category: 'Computers' },
    { name: 'Monitor 24-inch', code: 'MON_24', category: 'Peripherals' },
    { name: 'Wireless Mouse', code: 'MOUSE_WL', category: 'Peripherals' },
    { name: 'Mechanical Keyboard', code: 'KEY_MECH', category: 'Peripherals' },
    { name: 'Noise Cancelling Headset', code: 'HEADSET_NC', category: 'Audio' },
    { name: 'USB-C Hub', code: 'DONGLE_USB', category: 'Accessories' }
  ],
  Stationery: [
    { name: 'A4 Ruled Notebook', code: 'NOTE_A4', category: 'Paper' },
    { name: 'Blue/Black Pens Box', code: 'PEN_BOX', category: 'Writing' },
    { name: 'Whiteboard Markers', code: 'MARKER_WB', category: 'Writing' },
    { name: 'Sticky Notes (Pack of 5)', code: 'POSTIT', category: 'Paper' },
    { name: 'A4 Printer Paper Ream', code: 'PAPER_REAM', category: 'Printing' },
    { name: 'Stapler & Pins', code: 'STAPLER', category: 'Desk' },
    { name: 'File Folders (Pack of 10)', code: 'FOLDER', category: 'Storage' }
  ],
  Provider: [
    { name: 'Airtel Enterprise', code: 'AIRTEL', category: 'Telecom' },
    { name: 'Jio Business', code: 'JIO', category: 'Telecom' },
    { name: 'Dell Corporate Sales', code: 'DELL_CORP', category: 'Hardware' },
    { name: 'Amazon Web Services', code: 'AWS', category: 'Cloud' },
    { name: 'Blue Dart Express', code: 'BLUEDART', category: 'Courier' },
    { name: 'WeWork', code: 'WEWORK', category: 'Workspace' }
  ],
  Brand: [
    { name: 'Apple', code: 'APPLE', category: 'Hardware' },
    { name: 'Dell', code: 'DELL', category: 'Hardware' },
    { name: 'Lenovo', code: 'LENOVO', category: 'Hardware' },
    { name: 'HP', code: 'HP', category: 'Hardware' },
    { name: 'Logitech', code: 'LOGITECH', category: 'Peripherals' },
    { name: 'Jabra', code: 'JABRA', category: 'Audio' },
    { name: 'Cisco', code: 'CISCO', category: 'Networking' }
  ],
  Service: [
    { name: 'Internet Leased Line', code: 'ILL', category: 'IT' },
    { name: 'Office Deep Cleaning', code: 'CLEANING', category: 'Facility' },
    { name: 'Security Guard / Agency', code: 'SECURITY', category: 'Facility' },
    { name: 'Courier & Logistics', code: 'COURIER', category: 'Operations' },
    { name: 'Drinking Water Supply', code: 'WATER', category: 'Facility' },
    { name: 'Pest Control', code: 'PEST', category: 'Facility' }
  ],
  MobileService: [
    { name: 'Corporate Postpaid SIM', code: 'SIM_POST', category: 'Voice & Data' },
    { name: 'Data Card / Dongle', code: 'DONGLE', category: 'Data Only' },
    { name: 'International Roaming Pack', code: 'ROAMING', category: 'Voice & Data' }
  ],
  UtilityProvider: [
    { name: 'State Electricity Board', code: 'ELECTRICITY', category: 'Power' },
    { name: 'Municipal Water Corp', code: 'WATER_CORP', category: 'Water' },
    { name: 'Tata Power', code: 'TATA_PWR', category: 'Power' },
    { name: 'Mahanagar Gas', code: 'GAS', category: 'Gas' }
  ],
  QuestionPaper: [
    { name: 'Aptitude & Logical Reasoning', code: 'APTITUDE', category: 'Screening' },
    { name: 'Frontend Developer Technical', code: 'TECH_FE', category: 'Technical' },
    { name: 'Backend Developer Technical', code: 'TECH_BE', category: 'Technical' },
    { name: 'HR Behavioral Round', code: 'HR_BEHAVIOR', category: 'HR' },
    { name: 'Sales Scenario Pitch', code: 'SALES_PITCH', category: 'Sales' }
  ],
  OptionQuestion: [
    { name: 'React Virtual DOM', code: 'Q_FE_1', category: 'Frontend', description: 'Explain how the React Virtual DOM works and differs from the Real DOM.' },
    { name: 'Node.js Event Loop', code: 'Q_BE_1', category: 'Backend', description: 'Describe the phases of the Node.js event loop in detail.' },
    { name: 'Database Indexing', code: 'Q_DB_1', category: 'Database', description: 'What is a database index, and how does it improve query performance?' },
    { name: 'Conflict Resolution', code: 'Q_HR_1', category: 'Behavioral', description: 'Tell us about a time you had a conflict with a coworker and how you resolved it.' },
    { name: 'B2B Sales Cycle', code: 'Q_SALES_1', category: 'Sales', description: 'Walk me through your typical B2B sales cycle from prospecting to closing.' }
  ]
};

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM').then(async () => {
  for (const [modelKey, dataList] of Object.entries(seedData)) {
    const Model = models[modelKey];
    console.log(`Seeding ${modelKey} (${dataList.length} items)...`);
    
    for (let item of dataList) {
      await Model.findOneAndUpdate(
        { code: item.code, tenantId },
        { ...item, tenantId, isActive: true },
        { upsert: true }
      );
    }
  }

  console.log('All Master Data Seeded Successfully!');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
