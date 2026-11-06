import type { ChronoEventDraft } from './events';
import { applyEvent } from './reducer';
import type { ChronoState } from './types';

export class Recorder {
  state: ChronoState;
  readonly drafts: ChronoEventDraft[] = [];

  constructor(initial: ChronoState) {
    this.state = initial;
  }

  emit(event: ChronoEventDraft): void {
    this.drafts.push(event);
    this.state = applyEvent(this.state, event);
  }
}
