require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      week_key TEXT NOT NULL,
      project TEXT NOT NULL,
      case_task_event TEXT NOT NULL,
      service_team TEXT NOT NULL,
      sg_ticket TEXT DEFAULT '',
      billable BOOLEAN DEFAULT false,
      billing TEXT DEFAULT '',
      hours_mon NUMERIC DEFAULT 0,
      hours_tue NUMERIC DEFAULT 0,
      hours_wed NUMERIC DEFAULT 0,
      hours_thu NUMERIC DEFAULT 0,
      hours_fri NUMERIC DEFAULT 0,
      hours_sat NUMERIC DEFAULT 0,
      hours_sun NUMERIC DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS timesheet_status (
      user_id TEXT NOT NULL,
      week_key TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      PRIMARY KEY (user_id, week_key)
    );
  `);
}

async function getWeekEntries(userId, weekKey) {
  const { rows } = await pool.query(
    `SELECT * FROM time_entries WHERE user_id=$1 AND week_key=$2 ORDER BY created_at`,
    [userId, weekKey]
  );
  return rows;
}

async function addTimeEntry(userId, weekKey, entry) {
  const { rows } = await pool.query(
    `INSERT INTO time_entries
      (user_id, week_key, project, case_task_event, service_team, sg_ticket, billable, billing,
       hours_mon, hours_tue, hours_wed, hours_thu, hours_fri, hours_sat, hours_sun)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      userId, weekKey, entry.project, entry.case_task_event, entry.service_team,
      entry.sg_ticket || '', entry.billable || false, entry.billing || '',
      entry.hours?.mon || 0, entry.hours?.tue || 0, entry.hours?.wed || 0,
      entry.hours?.thu || 0, entry.hours?.fri || 0, entry.hours?.sat || 0, entry.hours?.sun || 0,
    ]
  );
  return rows[0];
}

async function updateTimeEntry(id, updates) {
  const fields = [];
  const values = [];
  let i = 1;
  const columnMap = {
    project: 'project', case_task_event: 'case_task_event', service_team: 'service_team',
    sg_ticket: 'sg_ticket', billable: 'billable', billing: 'billing',
    hours_mon: 'hours_mon', hours_tue: 'hours_tue', hours_wed: 'hours_wed',
    hours_thu: 'hours_thu', hours_fri: 'hours_fri', hours_sat: 'hours_sat', hours_sun: 'hours_sun',
  };
  for (const [key, col] of Object.entries(columnMap)) {
    if (updates[key] !== undefined) {
      fields.push(`${col}=$${i++}`);
      values.push(updates[key]);
    }
  }
  if (fields.length === 0) throw new Error('No valid fields to update');
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE time_entries SET ${fields.join(', ')} WHERE id=$${i} RETURNING *`,
    values
  );
  return rows[0];
}

async function deleteTimeEntry(id) {
  await pool.query(`DELETE FROM time_entries WHERE id=$1`, [id]);
}

async function getTimesheetStatus(userId, weekKey) {
  const { rows } = await pool.query(
    `SELECT status FROM timesheet_status WHERE user_id=$1 AND week_key=$2`,
    [userId, weekKey]
  );
  return rows[0]?.status || 'draft';
}

async function setTimesheetStatus(userId, weekKey, status) {
  await pool.query(
    `INSERT INTO timesheet_status (user_id, week_key, status) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, week_key) DO UPDATE SET status=EXCLUDED.status`,
    [userId, weekKey, status]
  );
}

function currentWeekKey() {
  const d = new Date();
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

module.exports = { migrate, getWeekEntries, addTimeEntry, updateTimeEntry, deleteTimeEntry, getTimesheetStatus, setTimesheetStatus, currentWeekKey };
