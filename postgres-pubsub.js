const { PubSub } = require("graphql-subscriptions");
const pgListen = require("pg-listen");
const {
  eventEmitterAsyncIterator
} = require("./event-emitter-to-async-iterator");

const defaultCommonMessageHandler = message => message;

class PostgresPubSub extends PubSub {
  constructor(options = {}) {
    const { commonMessageHandler, ...pgOptions } = options;
    super();
    const pgListenOptions = {
      native: options.native,
      paranoidChecking: options.paranoidChecking,
      retryInterval: options.retryInterval,
      retryLimit: options.retryLimit,
      retryTimeout: options.retryTimeout,
      parse: options.parse,
      serialize: options.serialize,
    }
    this.pgListen = pgListen(pgOptions, pgListenOptions);
    this.triggers = (pgOptions.topics || []).concat(['error']);
    this.ee = this.pgListen.notifications;
    this.events = this.pgListen.events;
    this.subscriptions = {};
    this.subIdCounter = 0;
    this.commonMessageHandler = commonMessageHandler || defaultCommonMessageHandler;
    this.connected = false;
  }

  async connect() {
    console.log('calling connect')
    // confusingly, `pgListen.connect()` will reject if the first connection attempt fails
    // but then it will retry and emit a `connected` event if it later connects
    // see https://github.com/andywer/pg-listen/issues/32
    // so we put logic on the `connected` event
    this.pgListen.events.on('connected', () => {
      Promise.all(this.triggers.map((eventName) => {
        return this.pgListen.listenTo(eventName);
      })).then(() => {
        this.connected = true;
      });
    });
    try {
      await this.pgListen.connect();
    } catch (e) {
      if (!e.message.includes('ECONNREFUSED')) throw e;
    }
  }

  async publish(triggerName, payload) {
    if (!this.connected) {
      console.log(`attempted to publish a ${triggerName} event via pubsub, but client is not yet connected`)
      return false;
    }

    try {
      await this.pgListen.notify(triggerName, payload);
    } catch (e) {
      this.pgListen.events.emit('error', e)
    }
    return true;
  }
  async subscribe(triggerName, onMessage) {
    const callback = message => {
      onMessage(
        message instanceof Error
          ? message
          : this.commonMessageHandler(message)
      );
    };

    await this.pgListen.listenTo(triggerName);
    this.pgListen.notifications.on(triggerName, callback);
    this.subIdCounter = this.subIdCounter + 1;
    this.subscriptions[this.subIdCounter] = [triggerName, callback];
    return Promise.resolve(this.subIdCounter);
  }
  async unsubscribe(subId) {
    if (!this.connected) {
      console.log('attempted to unsubscribe to events via pubsub, but client is not yet connected')
    }

    const [triggerName, onMessage] = this.subscriptions[subId];
    delete this.subscriptions[subId];
    this.pgListen.unlisten(triggerName);
  }
  async close() {
    await this.pgListen.unlistenAll();
    await this.pgListen.close();
    this.connected = false;
  }

  asyncIterator(triggers) {
    return eventEmitterAsyncIterator(
      this.pgListen,
      triggers,
      this.commonMessageHandler
    );
  }
}

module.exports = { PostgresPubSub };
