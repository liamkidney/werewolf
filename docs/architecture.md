# Game architecture

This is a small, browser-first Werewolf prototype. Prefer composition and
declarative role definitions over a hierarchy of `Werewolf extends Player`
classes.

## Responsibility boundaries

| Module | Owns | Does not own |
| --- | --- | --- |
| `GameRepository` | Supabase queries, commands, subscriptions | Game rules or UI |
| `StateEngine` | Pure projections: `view`, `can`, `transition` | Timers, DOM, RPCs |
| `GameEngine` | Lobby validation and random role assignment | Phase sequencing |
| `RoleRegistry` | Public role names, teams and available actions | Secret role assignments |
| `PresentationFlow` | Pure declarative presentation sequence and durations | Local timers |
| `PresentationController` | Client-local timed reveals, victim suspense and farewell | Persisted game transitions |
| `PhaseAdvancer` | Retryable requests to automatically start day/night | Transition validation |
| `GameController` | Lifecycle orchestration and user event handling | Reimplementing business rules |
| `Screens` | DOM rendering and interaction binding | Database state changes |

`GameState` represents an immutable **public snapshot**. Keep role
assignments and role-specific investigations separate: role definitions are
not secret, but which player has which role is.

## Source of truth

PostgreSQL RPCs are authoritative for phase changes, vote validity,
investigations and night resolution. JavaScript permission checks provide
immediate UI feedback, not a security boundary.

For example, `StateEngine.can(..., 'AUTO_START_NIGHT')` enables a browser to
request a transition, while `auto_start_night_after_banishment` enforces the
phase, game status, round and deadline atomically. Do not reintroduce
frontend-only vote resolution that can diverge from these database rules.

## State model

- Persisted: `status`, `phase`, `step`, `roundNumber`, elimination data.
- Derived: `StateEngine.view(state, { playerId })` returns `stage`,
  `playerStatus` and any timed `presentation`.
- Local-only: a Seer's six-second result, a murdered player's suspense and
  their farewell. `PresentationController` preserves these even if the
  persisted game phase advances in another player's browser.

A finished game may still have a timed reveal before credits. Do not skip the
presentation just because the database status is `finished`.

## Extending roles

1. Add the role to `DEFAULT_RULES.roles`, including team, description and
   action names. Role metadata is accessed through `RoleRegistry`.
2. Extend lobby assignment, night UI and the role-specific RPC(s).
3. Extend the database role constraint, night-action completion and victory
   logic. This is essential: the registry itself cannot change SQL behaviour.
4. Test role confidentiality, action eligibility, eliminated players and
   endgame outcomes.

## Extending timed presentations

Add an entry to `PRESENTATION_SEQUENCES` and supply the new screen markup and
rendering. Timers should be managed by `PresentationController`, not bespoke
timeouts in `GameController`.

**Important:** The `results` and `dawn` transitions currently enforce
six-second and twelve-second deadlines, respectively, in separate Supabase
functions. If their configured total presentation durations change, update
those database deadlines as well. Do not assume the client sequence alone
controls when the persisted phase changes.

## Deployment caution

`dev` and production currently share one Supabase project. Refactors should
be committed to `dev` first, and any database changes must be explicitly
backward compatible with the production frontend.
