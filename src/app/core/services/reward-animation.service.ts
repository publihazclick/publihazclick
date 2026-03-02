import { Injectable, signal } from '@angular/core';

export interface RewardEvent {
  amount: number;
  /** Unique ID so same amount can be re-triggered */
  id: number;
}

@Injectable({ providedIn: 'root' })
export class RewardAnimationService {
  private readonly _event = signal<RewardEvent | null>(null);
  readonly event = this._event.asReadonly();
  private counter = 0;

  trigger(amount: number): void {
    this._event.set({ amount, id: ++this.counter });
    // Auto-clear after animation ends
    setTimeout(() => this._event.set(null), 2600);
  }
}
