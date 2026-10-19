# Shared Supabase migration — Werewolf

**Status: staged; production is not cut over.**

Current shared Supabase project ref: `psoncybkfsdmjksyrcvv` (display name is still `blocks`).
Existing Blocks and 25 Words tables remain in `public`.
The new `werewolf` schema contains all 11 table definitions, 33 RPC/trigger functions,
4 triggers, 61 constraints, 13 RLS policies, 5 Realtime tables and 8 public decoy questions.
Every cloned table has RLS enabled. Historical player and game records are **not imported yet**.

Production Werewolf still uses its original project `guldhewlhxhsxchbattf`.
The Werewolf `dev` branch points to the shared backend's `werewolf` schema.

## Expose the schema (required before the dev app works)

In the shared Supabase project Dashboard, visit **Integrations → Data API → Settings**
(or **Project Settings → API**, depending on the current interface).
Add `werewolf` to **Exposed schemas**, retaining `public` and any existing schemas.
The app sends `Accept-Profile: werewolf` / `Content-Profile: werewolf` automatically.

Docs: https://supabase.com/docs/guides/api/using-custom-schemas

## Historical data — one-time local import

Existing game sessions contain player names, role assignments and active game state.
The source project was deliberately retained. The built-in connector cannot safely
transfer the complete historical dataset between projects without a local database
connection. **Do not switch production while the old games are still active.**

When ready, stop all writes to the source game, obtain both PostgreSQL connection
strings from the Supabase Dashboard's **Connect** control, install compatible
`pg_dump` and `psql` clients, then set the database URLs in local environment
variables (never in GitHub or chat):

```bash
export WEREWOLF_SOURCE_DATABASE_URL='postgresql://...'
export SHARED_APPS_DATABASE_URL='postgresql://...'
bash scripts/migrate-werewolf-to-shared.sh
```

The script dumps only the 11 Werewolf tables, rewrites INSERT destinations to
`werewolf`, imports into the target inside **one transaction**, defers foreign
keys, temporarily suppresses the new DB's player INSERT triggers, reenables
them before COMMIT, and compares source/target table counts. Target tables
are truncated **only inside the migration transaction**. The original project
is never modified.

The source must remain quiescent until cutover: a snapshot does not include
subsequent writes. Count matching alone does not prove gameplay works.

## Cutover checklist

1. Complete the Supabase Data API exposed-schema setting.
2. Verify the dev app can create a game, join with 3+ phones, reveal roles,
   resolve night/day actions, receive Realtime events, run a runoff vote,
   rematch and rejoin by QR.
3. Import historical data and verify at least one existing historical game.
4. Confirm no writes were made to the old database after export.
5. Release the tested dev configuration to main/production.
6. Retain the original project as a rollback option; delete it only after
   all games and dependencies are proven migrated.

## Shared-project naming

Rename the existing Supabase project's display name from `blocks` to
`Apps` in Project Settings. Do **not** create a new project; the ref and
credentials stay the same. No connected tool can change that display name.

For future games, use one schema per app with explicit RLS and API grants.
Blocks and 25 Words are left in their current `public` tables to avoid
breaking the already-running games.

## Security

The new `werewolf.decoy_questions` table is readable but not writable by
anonymous clients. The original database's `public.decoy_questions` table
still has disabled RLS, a pre-existing exposure requiring separate live
remediation and compatible policies. Other legacy Werewolf RPC functions
use SECURITY DEFINER and deserve a dedicated security review before launch.

Only publishable client keys belong in browsers. Keep database passwords
and service-role secrets out of repositories.
