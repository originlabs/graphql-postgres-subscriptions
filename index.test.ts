// Adapted from https://github.com/apollographql/graphql-subscriptions/blob/master/src/test/tests.ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import createSubscriber, { Subscriber } from 'pg-listen';
import { PostgresPubSub } from './index';

let subscriber: Subscriber;

beforeEach(async () => {
  subscriber = createSubscriber({
    connectionString: process.env.DATABASE_URL,
  });
  await subscriber.connect();
});

afterEach(async () => {
  if (subscriber) {
    await subscriber.close();
  }
});

describe('PostgresPubSub', () => {
  test('subscribing and listening to events', async () => {
    await subscriber.listenTo('a');
    const ps = new PostgresPubSub(subscriber);
    await new Promise((resolve) => {
      ps.subscribe('a', (payload) => {
        expect(payload).toEqual('test');
        resolve(null);
      });
      const succeed = ps.publish('a', 'test');
      expect(succeed).resolves.toBe(undefined);
    });
  });

  test('unsubscribing', async () => {
    await subscriber.listenTo('a');
    const ps = new PostgresPubSub(subscriber);

    const subId = await ps.subscribe('a', () => {
      // We should not reach this point.
      expect.fail();
    });
    await ps.unsubscribe(subId);
    const succeed = ps.publish('a', 'test');
    expect(succeed).rejects.toThrow('Connection terminated');
  });

  test('Should emit error when payload exceeds Postgres 8000 character limit', async () => {
    await subscriber.listenTo('a');
    const ps = new PostgresPubSub(subscriber);

    await ps.subscribe('a', () => {});
    await expect(ps.publish('a', 'a'.repeat(9000))).rejects.toThrow('payload string too long');
  });

  test('AsyncIterator should trigger event on asyncIterator when published', async (done) => {
    const eventName = 'test';
    await subscriber.listenTo(eventName);
    const ps = new PostgresPubSub(subscriber);
    const iterator = ps.asyncIterator(eventName);

    await new Promise((resolve, reject) => {
      iterator
        .next()
        .then((result) => {
          expect(result).not.toBeUndefined();
          expect(result.value).not.toBeUndefined();
          expect(result.done).not.toBeUndefined();
          resolve(null);
        })
        .catch(reject);
    });

    await ps.publish(eventName, { test: true });
  });

  test('AsyncIterator should not trigger event on asyncIterator when publishing other event', async (done) => {
    const eventName = 'test2';
    await subscriber.listenTo(eventName);
    const ps = new PostgresPubSub({ topics: [eventName] });
    const iterator = ps.asyncIterator('test');
    const spy = jest.fn();

    iterator.next().then(spy);
    ps.publish(eventName, { test: true });
    expect(spy).not.toHaveBeenCalled();
    done();
  });

  test('AsyncIterator should register to multiple events', async (done) => {
    const eventName = 'test2';
    const ps = new PostgresPubSub({ topics: ['test', 'test2'] });
    await ps.connect();
    const iterator = ps.asyncIterator(['test', 'test2']);
    const spy = jest.fn();

    iterator
      .next()
      .then(() => {
        spy();
        expect(spy).toHaveBeenCalled();
        done();
      })
      .catch(done);
    ps.publish(eventName, { test: true });
  });

  test('AsyncIterator transforms messages using commonMessageHandler', async (done) => {
    const eventName = 'test';
    const commonMessageHandler = (message) => ({ transformed: message });
    const ps = new PostgresPubSub({ commonMessageHandler, topics: [eventName] });
    await ps.connect();
    const iterator = ps.asyncIterator(eventName);

    iterator
      .next()
      .then((result) => {
        expect(result).not.toBeUndefined();
        expect(result.value).toEqual({ transformed: { test: true } });
        expect(result.done).toBe(false);
        done();
      })
      .catch(done);

    ps.publish(eventName, { test: true });
  });

  test('PostgresPubSub transforms messages using commonMessageHandler', async function (done) {
    const commonMessageHandler = (message) => ({ transformed: message });
    const ps = new PostgresPubSub({ commonMessageHandler });
    await ps.connect();
    ps.subscribe('transform', (payload) => {
      expect(payload).toEqual({ transformed: { test: true } });
      done();
    })
      .then(() => {
        const succeed = ps.publish('transform', { test: true });
        expect(succeed).resolves.toBe(true);
      })
      .catch(done);
  });

  // This test does not clean up after it ends. It breaks the test that follows after it.
  // It won't break any tests if it's the last.
  // TODO: Fix it properly
  test('AsyncIterator should not trigger event on asyncIterator already returned', async (done) => {
    const eventName = 'test';
    const ps = new PostgresPubSub({ topics: [eventName] });
    await ps.connect();
    const iterator = ps.asyncIterator(eventName);

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    iterator
      .next()
      .then((result) => {
        expect(result).not.toBeUndefined();
        expect(result.value).not.toBeUndefined();
        expect(result.done).toBe(false);
      })
      .catch(done);

    ps.publish(eventName, { test: true });

    await delay(0);

    iterator
      .next()
      .then((result) => {
        expect(result).not.toBeUndefined();
        expect(result.value).toBeUndefined();
        expect(result.done).toBe(true);
        done();
      })
      .catch(done);

    await delay(0);

    iterator.return();

    ps.publish(eventName, { test: true });
  });
});
