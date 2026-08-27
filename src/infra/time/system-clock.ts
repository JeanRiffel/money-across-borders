import { Clock } from '../../domain/shared/clock';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
