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
      if (channel !== this.channel) return;
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onChange();
    });
  }

  async stop() {
    const previous = this.channel;
    this.channel = null;
    if (previous) await this.repository.disposeChannel(previous);
  }
}
