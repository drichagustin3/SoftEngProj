# S1-DEV-06 terminal verification

Run these commands from `/workspaces/SoftEngProj`. PostgreSQL must be running with
the existing `.env` configuration, including `JWT_SECRET`. Use your existing
active superadmin credentials. This task does not seed privileged accounts.

The three new endpoints require an active superadmin:

| Method | Path | Body |
| --- | --- | --- |
| PATCH | `/api/users/:id/approve` | Empty; target must be pending |
| PATCH | `/api/users/:id/role` | `{"role":"admin"}` (also accepts user/superadmin) |
| DELETE | `/api/users/:id` | Empty; permanently removes the user and their reset tokens |

Existing `PUT /api/users/:id` and `PATCH /api/users/:id/block` share the same
last-superadmin protection. Only superadmins may change roles or status through
PUT. Admins retain profile editing and regular-user block/unblock permissions.
Block/unblock cannot approve pending accounts. Self-blocking remains forbidden.

An active superadmin has `role = 'superadmin'`, `status = 'active'`, and
`is_blocked = false`. Removing, demoting, or setting any nonactive status on the
sole active superadmin returns HTTP 400 with:

```json
{"message":"Cannot remove or disable the last remaining superadmin"}
```

All mutation paths take a table write lock inside a transaction before reading
the actor, target, and remaining-superadmin count. This serializes competing API
updates/deletions, including operations on different users. Authorization is
rechecked inside that transaction. Direct SQL performed outside these application
paths must preserve the invariant separately.

## 1. Apply the small migration and start the server

Apply this to existing `hopedb`; the full sample schema reloads business data and
is not the migration command.

```bash
node <<'NODE'
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const { pool } = require('./config/db');
pool.query(fs.readFileSync('migrations/006_user_disabled_status.sql', 'utf8'))
  .then(() => console.log('S1-DEV-06 migration applied.'))
  .catch(err => { console.error(err.message); process.exitCode = 1; })
  .finally(() => pool.end());
NODE
npm run dev
```

## 2. Log in from another terminal tab

Set `BASE_URL` to your configured port if it differs from 3000. These commands use
`jq` (available in this Codespace). Keep this terminal tab for subsequent steps.

```bash
BASE_URL=http://localhost:3000
read -r -p 'Active superadmin email: ' SA_EMAIL
read -r -s -p 'Superadmin password: ' SA_PASSWORD; printf '\n'
TOKEN=$(curl -fsS "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg email "$SA_EMAIL" --arg password "$SA_PASSWORD" \
    '{email:$email,password:$password}')" | jq -er '.token')
unset SA_PASSWORD
SUPERADMIN_ID=$(curl -fsS "$BASE_URL/api/users/me" \
  -H "Authorization: Bearer $TOKEN" | jq -er '.user.userId')
printf 'Authenticated user ID: %s\n' "$SUPERADMIN_ID"
```

## 3. Register a pending user, approve, then designate an admin

Registration returns 201/pending; approval and role update return 200. A unique
test username avoids collisions when rerunning these commands.

```bash
TEST_NAME="s106_$(date +%s)"
TEST_EMAIL="$TEST_NAME@example.invalid"
read -r -s -p 'Password for the new test user (at least 6 characters): ' TEST_PASSWORD; printf '\n'
USER_ID=$(curl -fsS "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg username "$TEST_NAME" --arg email "$TEST_EMAIL" \
    --arg password "$TEST_PASSWORD" '{username:$username,email:$email,password:$password}')" \
  | jq -er '.user.user_id')

# 200: activate the pending account.
curl -i -X PATCH "$BASE_URL/api/users/$USER_ID/approve" \
  -H "Authorization: Bearer $TOKEN"

# 400: approving the same account again is rejected.
curl -i -X PATCH "$BASE_URL/api/users/$USER_ID/approve" \
  -H "Authorization: Bearer $TOKEN"

# 200: designate the newly approved user as an admin.
curl -i -X PATCH "$BASE_URL/api/users/$USER_ID/role" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"role":"admin"}'

ADMIN_TOKEN=$(curl -fsS "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg email "$TEST_EMAIL" --arg password "$TEST_PASSWORD" \
    '{email:$email,password:$password}')" | jq -er '.token')
unset TEST_PASSWORD

# 403: an admin cannot approve users or designate admins.
curl -i -X PATCH "$BASE_URL/api/users/$USER_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
curl -i -X PATCH "$BASE_URL/api/users/$USER_ID/role" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"role":"admin"}'
```

## 4. Attempt to block, disable, demote, and delete the last superadmin

The block executes only when you are the sole active superadmin. If multiple
active superadmins exist, the application correctly permits some of these
operations, so the commands skip them rather than change your account.

```bash
ACTIVE_SA_COUNT=$(curl -fsS "$BASE_URL/api/users" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '[.users[] | select(.role == "superadmin" and .status == "active" and .is_blocked == false)] | length')

if [ "$ACTIVE_SA_COUNT" = 1 ]; then
  # Each request must return 400 and the last-superadmin protection message.
  curl -i -X PATCH "$BASE_URL/api/users/$SUPERADMIN_ID/block" \
    -H "Authorization: Bearer $TOKEN"
  curl -i -X PUT "$BASE_URL/api/users/$SUPERADMIN_ID" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"status":"disabled"}'
  curl -i -X PUT "$BASE_URL/api/users/$SUPERADMIN_ID" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"status":"blocked"}'
  curl -i -X PATCH "$BASE_URL/api/users/$SUPERADMIN_ID/role" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"role":"admin"}'
  curl -i -X PUT "$BASE_URL/api/users/$SUPERADMIN_ID" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"role":"user"}'
  curl -i -X DELETE "$BASE_URL/api/users/$SUPERADMIN_ID" \
    -H "Authorization: Bearer $TOKEN"
else
  printf 'Skipped last-superadmin tests: found %s active superadmins. Use a database with one active superadmin.\n' "$ACTIVE_SA_COUNT"
fi
```

## 5. Validation, missing authentication, and immediate revocation

```bash
# 401: no token.
curl -i -X PATCH "$BASE_URL/api/users/$USER_ID/approve"

# 400: invalid ID and role.
curl -i -X PATCH "$BASE_URL/api/users/1junk/role" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"role":"admin"}'
curl -i -X PATCH "$BASE_URL/api/users/$USER_ID/role" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"role":"root"}'

# 200: disable only the newly created test admin.
curl -i -X PUT "$BASE_URL/api/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"disabled"}'

# 403: the existing admin JWT is immediately denied.
curl -i "$BASE_URL/api/users" -H "Authorization: Bearer $ADMIN_TOKEN"

# Optional cleanup: 200, permanently removes the test user created above.
curl -i -X DELETE "$BASE_URL/api/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## Automated verification

```bash
npm test
pg_virtualenv -t env S1_DEV_06_DB_TEST=1 npm test
```

The second command runs the PostgreSQL integration tests in a disposable cluster,
including concurrent demotions/deletions and migration checks. Without the flag,
the integration suite is skipped. Neither command modifies your existing hopedb.

After terminal verification and explicit approval, the dedicated commit message is:

```text
feat: implement admin approval and superadmin safety constraints [S1-DEV-06]
```
