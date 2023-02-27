import { PubSubEngine } from 'graphql-subscriptions';
import type { Subscriber as PgListenSubscriber } from 'pg-listen';
import { EventEmitterAsyncIterator } from './event-emitter-to-async-iterator';

export class PostgresPubSub extends PubSubEngine {
  private readonly pgListen: PgListenSubscriber;
  private subscriptions: {
    [key: string]: [triggerName: string, onMessage: (...args: any[]) => void];
  } = {};
  private subIdCounter: number = 0;

  constructor(subscriber: PgListenSubscriber) {
    super();

    this.pgListen = subscriber;
    // @ts-ignore
    this.ee = this.pgListen.notifications;
  }

  async publish(triggerName: string, payload: any) {
    await this.pgListen.notify(triggerName, payload);
  }

  subscribe(triggerName: string, onMessage: (...args: any[]) => void) {
    this.pgListen.notifications.on(triggerName, onMessage);
    ++this.subIdCounter;
    this.subscriptions[this.subIdCounter] = [triggerName, onMessage];
    return Promise.resolve(this.subIdCounter);
  }

  async unsubscribe(subId: number) {
    delete this.subscriptions[subId];
  }

  /*
   * The difference between this function and asyncIterator is that the
   * topics can still be empty.
   */
  async asyncIteratorPromised(triggers: string[]) {
    return new EventEmitterAsyncIterator(this.pgListen, triggers);
  }

  asyncIterator(triggers: string | string[]) {
    return new EventEmitterAsyncIterator(
      this.pgListen,
      Array.isArray(triggers) ? triggers : [triggers],
    );
  }
}
