// Based on https://github.com/apollographql/graphql-subscriptions/blob/master/src/event-emitter-to-async-iterator.ts
import type { Subscriber as PgListenSubscriber } from 'pg-listen';

export class EventEmitterAsyncIterator<T> implements AsyncIterator<T> {
  pullQueue: Function[] = [];
  pushQueue: any[] = [];
  listening = true;

  constructor(pgListen: PgListenSubscriber, eventNames: string[]) {
    for (const eventName of eventNames) {
      pgListen.notifications.on(eventName, this.pushValue);
    }
  }

  pullValue(): Promise<IteratorResult<any>> {
    return new Promise((resolve) => {
      if (this.pushQueue.length > 0) {
        resolve({ value: this.pushQueue.shift(), done: false });
      } else {
        this.pullQueue.push(resolve);
      }
    });
  }

  pushValue(value: any) {
    if (this.pullQueue.length > 0) {
      this.pullQueue.shift()!({ value, done: false });
    } else {
      this.pushQueue.push(value);
    }
  }

  private emptyQueue() {
    if (this.listening) {
      this.listening = false;
      this.pullQueue.forEach((resolve) => resolve({ value: undefined, done: true }));
      this.pullQueue.length = 0;
      this.pushQueue.length = 0;
    }
  }

  public async next() {
    return this.listening ? this.pullValue() : this.return();
  }

  public return(): Promise<IteratorReturnResult<any>> {
    this.emptyQueue();
    return Promise.resolve({ value: undefined, done: true });
  }

  public async throw(error?: any) {
    this.emptyQueue();
    return Promise.reject(error);
  }

  public [Symbol.asyncIterator]() {
    return this;
  }
}
