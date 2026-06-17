const { PROJECTS, CASE_TASK_EVENTS, SERVICE_TEAMS, BILLING_OPTIONS } = require('./seed-data');

const DAY_KEYS = ['hours_mon', 'hours_tue', 'hours_wed', 'hours_thu', 'hours_fri', 'hours_sat', 'hours_sun'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function opt(v) { return { text: { type: 'plain_text', text: v, emoji: true }, value: v }; }
function toOptions(arr) { return arr.map(opt); }
function totalHours(e) { return DAY_KEYS.reduce((s, k) => s + parseFloat(e[k] || 0), 0); }

function buildReviewCard(pending) {
  const id = pending.id;
  const tot = totalHours(pending);
  const billIcon = pending.billable ? ':white_check_mark:' : ':white_large_square:';
  const hourStr = DAY_KEYS.map((k, i) => {
    const h = parseFloat(pending[k] || 0);
    return h > 0 ? `*${DAY_LABELS[i]}* ${h}h` : `~${DAY_LABELS[i]}~`;
  }).join('   ');

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '⏱  NetSuite Time Entry — Review', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '_Please review and edit if needed before confirming._' },
    },
    { type: 'divider' },
    {
      type: 'section',
      block_id: `review_project_${id}`,
      text: { type: 'mrkdwn', text: ':briefcase:  *Customer : Project*' },
      accessory: {
        type: 'static_select',
        action_id: 'review_project',
        options: toOptions(PROJECTS),
        initial_option: pending.project ? opt(pending.project) : undefined,
        placeholder: { type: 'plain_text', text: 'Select project…' },
      },
    },
    {
      type: 'section',
      block_id: `review_case_task_${id}`,
      text: { type: 'mrkdwn', text: ':clipboard:  *Case / Task / Event*' },
      accessory: {
        type: 'static_select',
        action_id: 'review_case_task',
        options: toOptions(CASE_TASK_EVENTS),
        initial_option: pending.case_task_event ? opt(pending.case_task_event) : undefined,
        placeholder: { type: 'plain_text', text: 'Select task…' },
      },
    },
    {
      type: 'section',
      block_id: `review_service_team_${id}`,
      text: { type: 'mrkdwn', text: ':busts_in_silhouette:  *Service Team*' },
      accessory: {
        type: 'static_select',
        action_id: 'review_service_team',
        options: toOptions(SERVICE_TEAMS),
        initial_option: pending.service_team ? opt(pending.service_team) : undefined,
        placeholder: { type: 'plain_text', text: 'Select team…' },
      },
    },
    {
      type: 'section',
      block_id: `review_billing_${id}`,
      text: { type: 'mrkdwn', text: `:moneybag:  *Billing*   ${billIcon} ${pending.billable ? 'Billable' : 'Non-billable'}` },
      accessory: {
        type: 'static_select',
        action_id: 'review_billing',
        options: toOptions(BILLING_OPTIONS),
        initial_option: pending.billing ? opt(pending.billing) : undefined,
        placeholder: { type: 'plain_text', text: 'Select billing…' },
      },
    },
    {
      type: 'actions',
      block_id: `review_billable_${id}`,
      elements: [
        {
          type: 'checkboxes',
          action_id: 'review_billable',
          options: [{ text: { type: 'plain_text', text: 'Billable' }, value: 'yes' }],
          ...(pending.billable ? { initial_options: [{ text: { type: 'plain_text', text: 'Billable' }, value: 'yes' }] } : {}),
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `:clock1:  *Hours*\n${hourStr}   ┊   *Total: ${tot}h*` },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          style: 'primary',
          text: { type: 'plain_text', text: '✅  Confirm & Save', emoji: true },
          action_id: 'confirm_entry',
          value: id,
          confirm: {
            title: { type: 'plain_text', text: 'Save this entry?' },
            text: { type: 'mrkdwn', text: `Save *${tot}h* on *${pending.project || 'selected project'}*?` },
            confirm: { type: 'plain_text', text: 'Save' },
            deny: { type: 'plain_text', text: 'Go back' },
          },
        },
        {
          type: 'button',
          style: 'danger',
          text: { type: 'plain_text', text: '❌  Cancel', emoji: true },
          action_id: 'cancel_entry',
          value: id,
        },
      ],
    },
  ];
}

function buildConfirmedCard(entry) {
  const DAY_HOUR_KEYS = ['hours_mon', 'hours_tue', 'hours_wed', 'hours_thu', 'hours_fri', 'hours_sat', 'hours_sun'];
  const tot = DAY_HOUR_KEYS.reduce((s, k) => s + parseFloat(entry[k] || 0), 0);
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:white_check_mark:  *Saved to NetSuite!*\n*${entry.project}*\n${entry.case_task_event}  ·  ${entry.service_team}  ·  *${tot}h*`,
      },
    },
  ];
}

function buildCancelledCard() {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: ':x:  *Cancelled.* The time entry was not saved.' },
    },
  ];
}

module.exports = { buildReviewCard, buildConfirmedCard, buildCancelledCard };
