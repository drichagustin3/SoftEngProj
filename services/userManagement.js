const { pool } = require('../config/db');

const fields = 'user_id, username, email, role, status, is_blocked, created_at';
const activeSuperadmin = user => user.role === 'superadmin' &&
  user.status === 'active' && !user.is_blocked;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

exports.mutateUser = async (actorId, targetId, action, body) => {
  let client;
  let releaseError;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Serialize user writes BEFORE reading any account state. This prevents two
    // concurrent demotions/deletions from each seeing a different remaining admin.
    // Unlike a row lock, it also covers writers targeting different accounts.
    await client.query('LOCK TABLE app_user IN SHARE ROW EXCLUSIVE MODE');
    const actor = (await client.query('SELECT * FROM app_user WHERE user_id = $1', [actorId])).rows[0];
    if (!actor || actor.status !== 'active' || actor.is_blocked ||
        !['admin', 'superadmin'].includes(actor.role)) {
      fail(403, 'An active administrator account is required.');
    }
    if (['approve', 'role', 'delete'].includes(action) && actor.role !== 'superadmin') {
      fail(403, 'Only an active superadmin can perform this action.');
    }
    const target = (await client.query('SELECT * FROM app_user WHERE user_id = $1', [targetId])).rows[0];
    if (!target) fail(404, 'User not found.');
    if (actor.role === 'admin' && target.role === 'superadmin') {
      fail(403, 'Admins cannot modify Superadmin accounts.');
    }

    const next = { ...target };
    if (action === 'approve') {
      if (target.status !== 'pending') fail(400, 'Only pending users can be approved.');
      next.status = 'active';
      next.is_blocked = false;
    } else if (action === 'role') {
      next.role = body.role;
    } else if (action === 'block') {
      if (!['active', 'blocked'].includes(target.status)) {
        fail(400, 'Only active or blocked accounts can use the block toggle.');
      }
      if (actor.role === 'admin' && target.role !== 'user') {
        fail(403, 'Admins can only block regular Users.');
      }
      next.is_blocked = !target.is_blocked;
      next.status = next.is_blocked ? 'blocked' : 'active';
      if (!next.is_blocked && target.status !== 'blocked') {
        fail(400, 'Only blocked users can be unblocked.');
      }
    } else if (action === 'update') {
      if (actor.role !== 'superadmin' &&
          ((body.role !== undefined && body.role !== target.role) ||
           (body.status !== undefined && body.status !== target.status))) {
        fail(403, 'Only an active superadmin can change roles or account status.');
      }
      if (body.username !== undefined) next.username = body.username.trim();
      if (body.email !== undefined) next.email = body.email.trim().toLowerCase();
      if (body.role !== undefined) next.role = body.role;
      if (body.status !== undefined) {
        next.status = body.status;
        next.is_blocked = body.status === 'blocked';
      }
    }

    if (activeSuperadmin(target) && (action === 'delete' || !activeSuperadmin(next))) {
      const result = await client.query(
        "SELECT COUNT(*)::integer AS count FROM app_user WHERE role = 'superadmin' AND status = 'active' AND is_blocked = FALSE"
      );
      if (result.rows[0].count <= 1) {
        fail(400, 'Cannot remove or disable the last remaining superadmin');
      }
    }
    // Preserve the S1-DEV-05 self-block rule after the more specific last-admin check.
    if (action === 'block' && actorId === targetId) {
      fail(400, 'Action Denied: You cannot block your own account.');
    }

    // Attribute cascading rights removals to the authenticated administrator.
    await client.query("SELECT set_config('app.username', $1, true)", [actor.username]);
    const result = action === 'delete'
      ? await client.query(`DELETE FROM app_user WHERE user_id = $1 RETURNING ${fields}`, [targetId])
      : await client.query(
        `UPDATE app_user SET username = $1, email = $2, role = $3, status = $4, is_blocked = $5
         WHERE user_id = $6 RETURNING ${fields}`,
        [next.username, next.email, next.role, next.status, next.is_blocked, targetId]
      );
    await client.query('COMMIT');
    return result.rows[0];
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
