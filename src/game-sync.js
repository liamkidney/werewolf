// Realtime signals invalidate the local snapshot; the repository reloads authoritative data.
export class GameSync {
  constructor(repository) {
    this.repository = repository;
    this.channel = null;
  }

  async subscribe(gameId, onChange) {
    await this.stop();
    const channel = this.repository.db.channel('lobby-' + gameId)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'players', filter: 'game_id=eq.' + gameId
      }, () => onChange())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'games', filter: 'id=eq.' + gameId
      }, () => onChange())
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'player_roles', filter: 'game_id=eq.' + gameId
      }, () => onChange());
    this.channel = channel;
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') onChange();
    });
  }

  async stop() {
    const previous = this.channel;
    this.channel = null;
    if (previous) await this.repository.disposeChannel(previous);
  }
}
