export class ProgressStore {
  private value = 0;
  private readonly listeners = new Set<() => void>();

  readonly getSnapshot = (): number => this.value;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set(value: number): void {
    if (value === this.value) return;
    this.value = value;
    for (const listener of this.listeners) listener();
  }
}
