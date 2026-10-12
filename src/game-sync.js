// Realtime signals invalidate the local snapshot; the repository reloads authoritative data.
export class GameSync {
  constructor(repository) {
    this.repository = repository;
    this.channel = null;
  }

  async subscribe(gameId, onChange) {
    await this.stop();
    const channel = this.repository.subscribeToGame(gameId, onChange);
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
