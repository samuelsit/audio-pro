import type { Clock } from '@ha/domain';

/** Horloge figée pour le dev et les tests. */
export class FakeClock implements Clock {
  constructor(private instant: string) {}

  now(): string {
    return this.instant;
  }

  regler(instant: string): void {
    this.instant = instant;
  }
}
