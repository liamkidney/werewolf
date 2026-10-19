# Shared Supabase — Werewolf fresh start

The shared Supabase project `psoncybkfsdmjksyrcvv` already holds **Blocks** and **25 Words** data. Keep all existing tables and records untouched.

Werewolf uses its own `werewolf` schema in the same project. The schema has 11 tables, 33 functions, 4 triggers, 61 constraints, RLS policies and Realtime configuration. Its game, player, role and vote tables are intentionally empty. The eight reusable decoy questions are retained.

**No historical Werewolf data migration is required.** Old games and sessions are not expected to resume after the cutover.

## Required setting

In [shared project Data API settings](https://supabase.com/dashboard/project/psoncybkfsdmjksyrcvv/integrations/data_api/settings), add `werewolf` to **Exposed schemas** while retaining `public` and `graphql_public`. The latest CI API check returned HTTP 406 (PGRST106) because `werewolf` is not yet exposed.

## Verification and release

1. Confirm the development API request to `werewolf.decoy_questions` returns HTTP 200.
2. Test creating and joining games, role assignment, day/night votes, bodyguard and seer actions, Realtime updates, runoff voting, rematches and QR rejoining.
3. When verified, merge dev to main and deploy production to the shared project.
4. Retain the old Werewolf Supabase project temporarily for rollback, then retire it separately. Do **not** delete the shared project or any Blocks tables.

The `dev` branch already targets the shared project's `werewolf` schema. Production continues to target the old project until explicitly released.

## Project naming

The shared project's display name may be changed from `blocks` to **Apps** in Supabase project settings. This does not change its project ID or existing data.
