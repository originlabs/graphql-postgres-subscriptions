// Adapted from https://github.com/apollographql/graphql-subscriptions/blob/master/src/test/tests.ts
const { isAsyncIterable } = require("iterall");

const { PostgresPubSub } = require("./postgres-pubsub");

describe("PostgresPubSub", () => {
  test("PostgresPubSub can subscribe when instantiated without a client", async function(done) {
    const ps = new PostgresPubSub();
    await ps.connect();
    ps.subscribe("a", payload => {
      expect(payload).toEqual("test");
      done();
    }).then(() => {
      const succeed = ps.publish("a", "test");
      expect(succeed).resolves.toBe(true);
    }).catch(done);
  });

  test("PostgresPubSub can subscribe and is called when events happen", async function(done) {
    const ps = new PostgresPubSub();
    await ps.connect();
    ps.subscribe("a", payload => {
      expect(payload).toEqual("test");
      done();
    }).then(() => {
      const succeed = ps.publish("a", "test");
      expect(succeed).resolves.toBe(true);
    }).catch(done);
  });

  test("PostgresPubSub can subscribe when instantiated with connection options but without a client", async function(done) {
    const ps = new PostgresPubSub({
      connectionString: process.env.DATABASE_URL
    });
    await ps.connect();
    ps.subscribe("a", payload => {
      expect(payload).toEqual("test");
      done();
    }).then(() => {
      const succeed = ps.publish("a", "test");
      expect(succeed).resolves.toBe(true);
    }).catch(done);
  });

  test("PostgresPubSub can unsubscribe", async function(done) {
    const ps = new PostgresPubSub();
    await ps.connect()

    ps.subscribe("a", payload => {
      expect(false).toBe(true); // Should not reach this point
    }).then(subId => {
      ps.unsubscribe(subId);
      const succeed = ps.publish("a", "test");
      expect(succeed).resolves.toBe(true); // True because publish success is not
      // indicated by trigger having subscriptions
      done(); // works because pubsub is synchronous
    }).catch(done);
  });

  test("Should emit error when payload exceeds Postgres 8000 character limit", async (done) => {
    const ps = new PostgresPubSub();
    await ps.connect();

    ps.events.on("error", err => {
      expect(err.toString()).toContain('payload')
      done();
    })

    ps.subscribe("a", () => {
      expect(false).toBe(true); // Should not reach this point
      done();
    }).then(() => {
      const succeed = ps.publish("a", "a".repeat(9000));
      expect(succeed).resolves.toBe(true);
    }).catch(done);
  });

  test("AsyncIterator should expose valid asyncIterator for a specific event", () => {
    const eventName = "test";
    const ps = new PostgresPubSub({ topics: [eventName]});
    const iterator = ps.asyncIterator(eventName);
    expect(iterator).not.toBeUndefined();
    expect(isAsyncIterable(iterator)).toBe(true);
  });

  test("AsyncIterator should trigger event on asyncIterator when published", async (done) => {
    const eventName = "test";
    const ps = new PostgresPubSub({ topics: [eventName]});
    await ps.connect()
    const iterator = ps.asyncIterator(eventName);

    iterator.next().then(result => {
      expect(result).not.toBeUndefined();
      expect(result.value).not.toBeUndefined();
      expect(result.done).not.toBeUndefined();
      done();
    }).catch(done);

    ps.publish(eventName, { test: true });
  });

  test("AsyncIterator should not trigger event on asyncIterator when publishing other event", async (done) => {
    const eventName = "test2";
    const ps = new PostgresPubSub({ topics: [eventName]});
    await ps.connect();
    const iterator = ps.asyncIterator("test");
    const spy = jest.fn();

    iterator.next().then(spy);
    ps.publish(eventName, { test: true });
    expect(spy).not.toHaveBeenCalled();
    done();
  });

  test("AsyncIterator should register to multiple events", async (done) => {
    const eventName = "test2";
    const ps = new PostgresPubSub({ topics: ['test', 'test2']});
    await ps.connect();
    const iterator = ps.asyncIterator(["test", "test2"]);
    const spy = jest.fn();

    iterator.next().then(() => {
      spy();
      expect(spy).toHaveBeenCalled();
      done();
    }).catch(done);
    ps.publish(eventName, { test: true });
  });

  test("AsyncIterator transforms messages using commonMessageHandler", async (done) => {
    const eventName = "test";
    const commonMessageHandler = message => ({ transformed: message });
    const ps = new PostgresPubSub({ commonMessageHandler, topics: [eventName] });
    await ps.connect();
    const iterator = ps.asyncIterator(eventName);

    iterator.next().then(result => {
      expect(result).not.toBeUndefined();
      expect(result.value).toEqual({ transformed: { test: true } });
      expect(result.done).toBe(false);
      done();
    }).catch(done);

    ps.publish(eventName, { test: true });
  });

  test("PostgresPubSub transforms messages using commonMessageHandler", async function(done) {
    const commonMessageHandler = message => ({ transformed: message });
    const ps = new PostgresPubSub({ commonMessageHandler });
    await ps.connect();
    ps.subscribe("transform", payload => {
      expect(payload).toEqual({ transformed: { test: true } });
      done();
    }).then(() => {
      const succeed = ps.publish("transform", { test: true });
      expect(succeed).resolves.toBe(true);
    }).catch(done);
  });

  // This test does not clean up after it ends. It breaks the test that follows after it.
  // It won't break any tests if it's the last. https://imgflip.com/i/2lmlgm
  // TODO: Fix it properly
  test("AsyncIterator should not trigger event on asyncIterator already returned", async done => {
    const eventName = "test";
    const ps = new PostgresPubSub({ topics: [eventName]});
    await ps.connect();
    const iterator = ps.asyncIterator(eventName);

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    iterator.next().then(result => {
      expect(result).not.toBeUndefined();
      expect(result.value).not.toBeUndefined();
      expect(result.done).toBe(false);
    }).catch(done);

    ps.publish(eventName, { test: true });

    await delay(0);

    iterator.next().then(result => {
      expect(result).not.toBeUndefined();
      expect(result.value).toBeUndefined();
      expect(result.done).toBe(true);
      done();
    }).catch(done);

    await delay(0);

    iterator.return();

    ps.publish(eventName, { test: true });
  });
});
