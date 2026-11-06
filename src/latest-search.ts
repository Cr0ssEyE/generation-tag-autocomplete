/** Keep one worker request in flight and only the most recent waiting request. */
export class LatestSearch<T extends { id: number }> {
  private active: number | null = null;
  private waiting: T | null = null;
  private send: (request: T) => void;
  constructor(send: (request: T) => void) {
    this.send = send;
  }
  submit(request: T) {
    if (this.active !== null) this.waiting = request;
    else {
      this.active = request.id;
      this.send(request);
    }
  }
  finish(id: number) {
    if (id !== this.active) return;
    this.active = null;
    const next = this.waiting;
    this.waiting = null;
    if (next) this.submit(next);
  }
  clear() {
    this.waiting = null;
  }
  reset() {
    this.active = null;
    this.waiting = null;
  }
}
