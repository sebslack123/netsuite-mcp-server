const PROJECTS = [
  'PRO007526 Sofigate Oy FI05 : Growth Champion',
  'PRO004432 Sofigate Oy FI05 : Presales Salesforce',
  'PRO004706 Sofigate Oy FI05 : Finland internal for Poland',
  'PRO007016 Sofigate Group Oy : Markkinointi automaatioratkaisut',
  'PRO008313 Espoo kaupunki : Development Project',
  'PRO007837 Espoo kaupunki : TE-palvelut Salesforce-Project',
  'PRO007971 Espoo kaupunki : Afternoon Club Payment Relief',
  'PRO007904 WWF Suomi : Project Management',
  'PRO000322 Finland Internal : Internal (No compensation)',
  'PRO000324 Finland Internal : Training (Compensation)',
  'PRO000326 Finland Internal : Internal (Compensation)',
  'PRO004171 Finland Internal : Training (No compensation)',
  'PRO004367 Finland Internal : Sales (No compensation)',
  'PRO000224 Finland Absence : Sofigate / Absence',
];

const CASE_TASK_EVENTS = [
  'Presales/Sales (Project Task)',
  'Development (Project Task)',
  'Project management (Project Task)',
  'General internal work (Project Task)',
  'Balance leave (Project Task)',
  'Internal work Pre-approved 80e/h (Project Task)',
  'Travel time non-invoiceable (Project Task)',
  'Testing & QA (Project Task)',
  'Architecture & Design (Project Task)',
  'Customer Meeting (Event)',
  'Internal Meeting (Event)',
  'Training (Event)',
  'Support & Maintenance (Case)',
  'Bug Fix (Case)',
];

const SERVICE_TEAMS = ['Internal', 'Senior Advisor', 'Consultant (S)', 'Junior Consultant', 'Team Lead', 'Sales'];
const BILLING_OPTIONS = ['Sofigate', 'Customer', 'Non-billable'];

module.exports = { PROJECTS, CASE_TASK_EVENTS, SERVICE_TEAMS, BILLING_OPTIONS };
