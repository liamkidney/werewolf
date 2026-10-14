import { DEFAULT_RULES } from './game-rules.js';

// Role behaviour is described by data rather than Player subclasses.
// The registry contains public role definitions, never secret assignments.
export class RoleRegistry {
  constructor(definitions = DEFAULT_RULES.roles) {
    this.definitions = definitions;
  }

  get(role) {
    return this.definitions[role] ?? null;
  }

  label(role) {
    return this.get(role)?.label ?? 'Unknown role';
  }

  description(role) {
    return this.get(role)?.description ?? '';
  }

  isOnTeam(role, team) {
    return this.get(role)?.team === team;
  }

  hasAction(role, action) {
    return this.get(role)?.actions.includes(action) ?? false;
  }
}

export const ROLES = new RoleRegistry();
