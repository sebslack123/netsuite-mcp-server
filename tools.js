const { PROJECTS, CASE_TASK_EVENTS, SERVICE_TEAMS, BILLING_OPTIONS } = require('./seed-data');
const db = require('./db');
const { buildReviewCard } = require('./review-blocks');
const { WebClient } = require('@slack/web-api');

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const tools = [
  {
    name: 'list_projects',
    description: 'Returns all valid NetSuite project options the user can log time against.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => ({ projects: PROJECTS }),
  },
  {
    name: 'list_task_types',
    description: 'Returns all valid case/task/event types, service teams, and billing options.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => ({ case_task_events: CASE_TASK_EVENTS, service_teams: SERVICE_TEAMS, billing_options: BILLING_OPTIONS }),
  },
  {
    name: 'get_week_entries',
    description: 'Returns all time entries for a given user and week. week_key defaults to the current ISO week (e.g. "2026-W25").',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'Slack user ID or name' },
        week_key: { type: 'string', description: 'ISO week key like "2026-W25". Omit for current week.' },
      },
      required: ['user_id'],
    },
    handler: async ({ user_id, week_key }) => {
      const wk = week_key || db.currentWeekKey();
      const entries = await db.getWeekEntries(user_id, wk);
      const status = await db.getTimesheetStatus(user_id, wk);
      const total = entries.reduce((s, e) =>
        s + [e.hours_mon, e.hours_tue, e.hours_wed, e.hours_thu, e.hours_fri, e.hours_sat, e.hours_sun]
          .reduce((a, h) => a + parseFloat(h || 0), 0), 0);
      return { week_key: wk, status, total_hours: total, entries };
    },
  },
  {
    name: 'add_time_entry',
    description: 'Creates a new time entry in NetSuite for the given user and week.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'Slack user ID or name' },
        week_key: { type: 'string', description: 'ISO week key. Omit for current week.' },
        project: { type: 'string', description: 'Full project name from list_projects' },
        case_task_event: { type: 'string', description: 'Task type from list_task_types' },
        service_team: { type: 'string', description: 'Service team from list_task_types' },
        sg_ticket: { type: 'string', description: 'Optional SG ticket number e.g. SG-1234' },
        billable: { type: 'boolean', description: 'Whether the time is billable' },
        billing: { type: 'string', description: 'Billing target: Sofigate, Customer, or Non-billable' },
        hours_mon: { type: 'number', description: 'Hours on Monday (0 if none)' },
        hours_tue: { type: 'number', description: 'Hours on Tuesday (0 if none)' },
        hours_wed: { type: 'number', description: 'Hours on Wednesday (0 if none)' },
        hours_thu: { type: 'number', description: 'Hours on Thursday (0 if none)' },
        hours_fri: { type: 'number', description: 'Hours on Friday (0 if none)' },
        hours_sat: { type: 'number', description: 'Hours on Saturday (0 if none)' },
        hours_sun: { type: 'number', description: 'Hours on Sunday (0 if none)' },
      },
      required: ['user_id', 'project', 'case_task_event', 'service_team', 'billable', 'billing'],
    },
    handler: async (args) => {
      const wk = args.week_key || db.currentWeekKey();
      // Accept flat hours_mon/tue/... fields
      const entry = await db.addTimeEntry(args.user_id, wk, {
        ...args,
        hours: {
          mon: args.hours_mon || 0, tue: args.hours_tue || 0, wed: args.hours_wed || 0,
          thu: args.hours_thu || 0, fri: args.hours_fri || 0, sat: args.hours_sat || 0, sun: args.hours_sun || 0,
        },
      });
      return { success: true, entry };
    },
  },
  {
    name: 'update_time_entry',
    description: 'Updates fields on an existing time entry. Get the entry ID from get_week_entries first.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'UUID of the time entry to update' },
        project: { type: 'string' },
        case_task_event: { type: 'string' },
        service_team: { type: 'string' },
        sg_ticket: { type: 'string' },
        billable: { type: 'boolean' },
        billing: { type: 'string' },
        hours_mon: { type: 'number' }, hours_tue: { type: 'number' }, hours_wed: { type: 'number' },
        hours_thu: { type: 'number' }, hours_fri: { type: 'number' }, hours_sat: { type: 'number' }, hours_sun: { type: 'number' },
      },
      required: ['id'],
    },
    handler: async ({ id, ...updates }) => {
      const entry = await db.updateTimeEntry(id, updates);
      return { success: true, entry };
    },
  },
  {
    name: 'delete_time_entry',
    description: 'Permanently deletes a time entry by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'UUID of the time entry to delete' } },
      required: ['id'],
    },
    handler: async ({ id }) => {
      await db.deleteTimeEntry(id);
      return { success: true, deleted_id: id };
    },
  },
  {
    name: 'submit_timesheet',
    description: 'Marks a weekly timesheet as submitted (locks it from further edits).',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        week_key: { type: 'string', description: 'Omit for current week.' },
      },
      required: ['user_id'],
    },
    handler: async ({ user_id, week_key }) => {
      const wk = week_key || db.currentWeekKey();
      await db.setTimesheetStatus(user_id, wk, 'submitted');
      return { success: true, user_id, week_key: wk, status: 'submitted' };
    },
  },
  {
    name: 'get_timesheet_summary',
    description: 'Returns a summary of total hours, billable hours, and status for a week.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        week_key: { type: 'string', description: 'Omit for current week.' },
      },
      required: ['user_id'],
    },
    handler: async ({ user_id, week_key }) => {
      const wk = week_key || db.currentWeekKey();
      const entries = await db.getWeekEntries(user_id, wk);
      const status = await db.getTimesheetStatus(user_id, wk);
      const DAY_KEYS = ['hours_mon', 'hours_tue', 'hours_wed', 'hours_thu', 'hours_fri', 'hours_sat', 'hours_sun'];
      const total = entries.reduce((s, e) => s + DAY_KEYS.reduce((a, k) => a + parseFloat(e[k] || 0), 0), 0);
      const billable = entries.filter(e => e.billable).reduce((s, e) => s + DAY_KEYS.reduce((a, k) => a + parseFloat(e[k] || 0), 0), 0);
      return { week_key: wk, status, total_hours: total, billable_hours: billable, entry_count: entries.length };
    },
  },
];

  {
    name: 'preview_time_entry',
    description: 'Sends a Block Kit review card to the user\'s DM so they can review, edit, and confirm before the entry is saved. Use this instead of add_time_entry when the user wants to review first.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'Slack user ID (e.g. U12345)' },
        week_key: { type: 'string', description: 'ISO week key. Omit for current week.' },
        project: { type: 'string', description: 'Full project name from list_projects' },
        case_task_event: { type: 'string', description: 'Task type from list_task_types' },
        service_team: { type: 'string', description: 'Service team from list_task_types' },
        sg_ticket: { type: 'string', description: 'Optional SG ticket number e.g. SG-1234' },
        billable: { type: 'boolean', description: 'Whether the time is billable' },
        billing: { type: 'string', description: 'Billing target: Sofigate, Customer, or Non-billable' },
        hours_mon: { type: 'number', description: 'Hours on Monday (0 if none)' },
        hours_tue: { type: 'number', description: 'Hours on Tuesday (0 if none)' },
        hours_wed: { type: 'number', description: 'Hours on Wednesday (0 if none)' },
        hours_thu: { type: 'number', description: 'Hours on Thursday (0 if none)' },
        hours_fri: { type: 'number', description: 'Hours on Friday (0 if none)' },
        hours_sat: { type: 'number', description: 'Hours on Saturday (0 if none)' },
        hours_sun: { type: 'number', description: 'Hours on Sunday (0 if none)' },
      },
      required: ['user_id', 'project', 'case_task_event', 'service_team', 'billable', 'billing'],
    },
    handler: async (args) => {
      const wk = args.week_key || db.currentWeekKey();

      // Open DM with the user
      const dm = await slack.conversations.open({ users: args.user_id });
      const channel = dm.channel.id;

      // Create pending entry (no slack_ts yet)
      const pending = await db.createPendingEntry({
        user_id: args.user_id,
        week_key: wk,
        slack_channel: channel,
        project: args.project,
        case_task_event: args.case_task_event,
        service_team: args.service_team,
        sg_ticket: args.sg_ticket || '',
        billable: args.billable || false,
        billing: args.billing || '',
        hours_mon: args.hours_mon || 0,
        hours_tue: args.hours_tue || 0,
        hours_wed: args.hours_wed || 0,
        hours_thu: args.hours_thu || 0,
        hours_fri: args.hours_fri || 0,
        hours_sat: args.hours_sat || 0,
        hours_sun: args.hours_sun || 0,
      });

      // Post review card to DM
      const msg = await slack.chat.postMessage({
        channel,
        text: 'NetSuite time entry review',
        blocks: buildReviewCard(pending),
      });

      // Store the message ts so Bolt app can update it
      await db.updatePendingEntry(pending.id, { slack_ts: msg.ts });

      return {
        success: true,
        message: 'Review card sent to your DMs — please confirm or edit the entry before it is saved to NetSuite.',
        pending_id: pending.id,
      };
    },
  },
];

module.exports = tools;
