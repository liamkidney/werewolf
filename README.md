# Werewolf

## Development and release

- Production: https://liamkidney.github.io/werewolf/ (`main`)
- Development: https://liamkidney.github.io/werewolf/dev/ (`dev`)

All application code, dependencies, deployment scripts and tests are changed on `dev`. Test and inspect the development website before release. To release, run **Promote validated Dev to Main** in GitHub Actions from the `main` branch. That workflow requires `main` to be an ancestor of `dev`, tests the exact development commit, and fast-forwards `main` to that SHA; Pages then deploys it unchanged. Do not develop directly on `main`, squash releases, cherry-pick production fixes, or create a new release merge commit.

Both channels target the shared Apps Supabase project and its dedicated `werewolf` schema. Build-time page paths and cache/PWA identity may vary; gameplay and data-access code should not.
