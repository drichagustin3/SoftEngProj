const { pool } = require('../config/db');
const { modules } = require('../config/rights');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

const present = rows => modules.map(module => {
  const row = rows.find(entry => entry.module === module.module);
  const enabled = row?.enabled || false;
  const selected = enabled ? (row?.actions || []) : [];
  return {
    module: module.module, label: module.label, enabled,
    actions: Object.fromEntries(module.actions.map(action => [action, selected.includes(action)])),
    all: enabled && module.actions.every(action => selected.includes(action)),
    none: selected.length === 0,
  };
});

const accessRights = async (actorId, targetId, changes) => {
  let client;
  let releaseError;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    if (changes) {
      // Same lock order as S1-DEV-06: prevent concurrent account changes and
      // serialize saves so each audit entry has the actual previous state.
      await client.query('LOCK TABLE app_user IN SHARE ROW EXCLUSIVE MODE');
    }
    const accounts = await client.query(
      'SELECT user_id, username, role, status, is_blocked FROM app_user WHERE user_id = ANY($1::integer[])',
      [[actorId, targetId]]
    );
    const actor = accounts.rows.find(user => user.user_id === actorId);
    if (!actor || actor.status !== 'active' || actor.is_blocked ||
        !['admin', 'superadmin'].includes(actor.role)) {
      fail(403, 'An active admin or superadmin is required to manage rights.');
    }
    const target = accounts.rows.find(user => user.user_id === targetId);
    if (!target) fail(404, 'User not found.');
    if (actor.role === 'admin' && target.role === 'superadmin') {
      fail(403, 'Admins cannot view or change Superadmin rights.');
    }
    const oldRows = (await client.query(
      'SELECT module, enabled, actions FROM user_module_rights WHERE user_id = $1', [targetId]
    )).rows;
    let changed = 0;
    if (changes) {
      await client.query("SELECT set_config('app.username', $1, true)", [actor.username]);
      for (const item of changes) {
        const old = oldRows.find(row => row.module === item.module);
        const oldActions = old?.actions || [];
        if ((old?.enabled || false) === item.enabled && oldActions.length === item.actions.length &&
            item.actions.every(action => oldActions.includes(action))) continue;
        await client.query(
          `INSERT INTO user_module_rights (user_id, module, enabled, actions)
           VALUES ($1, $2, $3, $4::text[])
           ON CONFLICT (user_id, module) DO UPDATE SET enabled = EXCLUDED.enabled, actions = EXCLUDED.actions`,
          [targetId, item.module, item.enabled, item.actions]
        );
        changed++;
      }
    }
    const rows = changes ? (await client.query(
      'SELECT module, enabled, actions FROM user_module_rights WHERE user_id = $1', [targetId]
    )).rows : oldRows;
    await client.query('COMMIT');
    return { userId: targetId, modules: present(rows), ...(changes ? { changed } : {}) };
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) { releaseError = rollbackError; }
    }
    throw err;
  } finally {
    if (client) client.release(releaseError);
  }
};

exports.getRights = (actorId, targetId) => accessRights(actorId, targetId);
exports.saveRights = (actorId, targetId, changes) => accessRights(actorId, targetId, changes);
