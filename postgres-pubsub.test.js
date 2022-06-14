// Adapted from https://github.com/apollographql/graphql-subscriptions/blob/master/src/test/tests.ts
const { isAsyncIterable } = require("iterall");

const { PostgresPubSub } = require("./postgres-pubsub");

describe("PostgresPubSub", () => {
  test("PostgresPubSub can subscribe when instantiated without a client", (done) => {
    const ps = new PostgresPubSub();
    ps.connect().then(() => {
      ps.subscribe("a", payload => {
        expect(payload).toEqual("test");
        done();
      }).then(() => {
        const succeed = ps.publish("a", "test");
        expect(succeed).resolves.toBe(true);
      }).catch(done);
    }).catch(done);
  });

  test("PostgresPubSub can subscribe and is called when events happen", (done) => {
    const ps = new PostgresPubSub();
    ps.connect().then(() => {
      ps.subscribe("a", payload => {
        expect(payload).toEqual("test");
        done();
      }).then(() => {
        const succeed = ps.publish("a", "test");
        expect(succeed).resolves.toBe(true);
      }).catch(done);
    }).catch(done);
  });

  test("PostgresPubSub can subscribe when instantiated with connection options but without a client", (done) => {
    const ps = new PostgresPubSub({
      connectionString: process.env.DATABASE_URL
    });

    ps.connect().then(() => {
      ps.subscribe("a", payload => {
        expect(payload).toEqual("test");
        done();
      }).then(() => {
        const succeed = ps.publish("a", "test");
        expect(succeed).resolves.toBe(true);
      }).catch(done);
    }).catch(done);
  });

  test("PostgresPubSub can unsubscribe", (done) => {
    const ps = new PostgresPubSub();
    ps.connect().then(() => {
      ps.subscribe("a", payload => {
        expect(false).toBe(true); // Should not reach this point
      }).then(subId => {
        ps.unsubscribe(subId);
        const succeed = ps.publish("a", "test");
        expect(succeed).resolves.toBe(true); // True because publish success is not
        // indicated by trigger having subscriptions
        done(); // works because pubsub is synchronous
      }).catch(done);
    }).catch(done);
  });

  test("Should emit error when payload exceeds Postgres 8000 character limit", async () => {
    const ps = new PostgresPubSub();
    await ps.connect();

    await ps.subscribe("a", () => {});
    await expect(
      ps.publish("a", "a".repeat(9000))
    ).rejects.toThrow('payload string too long');
  });

  test("AsyncIterator should expose valid asyncIterator for a specific event", () => {
    const eventName = "test";
    const ps = new PostgresPubSub({ topics: [eventName]});
    const iterator = ps.asyncIterator(eventName);
    expect(iterator).not.toBeUndefined();
    expect(isAsyncIterable(iterator)).toBe(true);
  });

  test("AsyncIterator should trigger event on asyncIterator when published", (done) => {
    const eventName = "test";
    const ps = new PostgresPubSub({ topics: [eventName]});
    ps.connect().then(() => {
      const iterator = ps.asyncIterator(eventName);

      iterator.next().then(result => {
        expect(result).not.toBeUndefined();
        expect(result.value).not.toBeUndefined();
        expect(result.done).not.toBeUndefined();
        done();
      }).catch(done);

      ps.publish(eventName, { test: true });
    }).catch(done);
  });

  test("AsyncIterator should not trigger event on asyncIterator when publishing other event", (done) => {
    const eventName = "test2";
    const ps = new PostgresPubSub({ topics: [eventName]});
    ps.connect().then(() => {
      const iterator = ps.asyncIterator("test");
      const spy = jest.fn();

      iterator.next().then(spy);
      ps.publish(eventName, { test: true });
      expect(spy).not.toHaveBeenCalled();
      done();
    }).catch(done);
  });

  test("AsyncIterator should register to multiple events", (done) => {
    const eventName = "test2";
    const ps = new PostgresPubSub({ topics: ['test', 'test2']});
    ps.connect().then(() => {
      const iterator = ps.asyncIterator(["test", "test2"]);
      const spy = jest.fn();

      iterator.next().then(() => {
        spy();
        expect(spy).toHaveBeenCalled();
        done();
      }).catch(done);
      ps.publish(eventName, { test: true });
    }).catch(done);
  });

  test("AsyncIterator transforms messages using commonMessageHandler", (done) => {
    const eventName = "test";
    const commonMessageHandler = message => ({ transformed: message });
    const ps = new PostgresPubSub({ commonMessageHandler, topics: [eventName] });
    ps.connect().then(() => {
      const iterator = ps.asyncIterator(eventName);

      iterator.next().then(result => {
        expect(result).not.toBeUndefined();
        expect(result.value).toEqual({ transformed: { test: true } });
        expect(result.done).toBe(false);
        done();
      }).catch(done);

      ps.publish(eventName, { test: true });
    }).catch(done);
  });

  test("PostgresPubSub transforms messages using commonMessageHandler", (done) => {
    const commonMessageHandler = message => ({ transformed: message });
    const ps = new PostgresPubSub({ commonMessageHandler });
    ps.connect().then(() => {
      ps.subscribe("transform", payload => {
        expect(payload).toEqual({ transformed: { test: true } });
        done();
      }).then(() => {
        const succeed = ps.publish("transform", { test: true });
        expect(succeed).resolves.toBe(true);
      }).catch(done);
    }).catch(done);
  });

  // This test does not clean up after it ends. It breaks the test that follows after it.
  // It won't break any tests if it's the last. https://imgflip.com/i/2lmlgm
  // TODO: Fix it properly
  test("AsyncIterator should not trigger event on asyncIterator already returned", (done) => {
    const eventName = "test";
    const ps = new PostgresPubSub({ topics: [eventName]});
    ps.connect().then(() => {
      const iterator = ps.asyncIterator(eventName);

      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

      iterator.next().then(result => {
        expect(result).not.toBeUndefined();
        expect(result.value).not.toBeUndefined();
        expect(result.done).toBe(false);
      }).catch(done);

      ps.publish(eventName, { test: true });

      delay(0).then(() => {
        iterator.next().then(result => {
          expect(result).not.toBeUndefined();
          expect(result.value).toBeUndefined();
          expect(result.done).toBe(true);
          done();
        }).catch(done);
  
        delay(0).then(() => {
          iterator.return();
  
          ps.publish(eventName, { test: true });
        });
      });    
    }).catch(done);
  });
  
  test("AsyncIteratorPromised should work without having topics on constructor", (done) => {
    const eventName = "test2";
    const ps = new PostgresPubSub();
    ps.connect().then(() => {
      ps.asyncIteratorPromised(["test", "test2"]).then((iterator) => {
        const spy = jest.fn();

        iterator.next().then(() => {
          spy();
          expect(spy).toHaveBeenCalled();
          done();
        }).catch(done);
        ps.publish(eventName, { test: true });
      });      
    }).catch(done);
  });
});
