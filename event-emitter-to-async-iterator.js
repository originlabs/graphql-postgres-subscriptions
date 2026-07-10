// Based on https://github.com/apollographql/graphql-subscriptions/blob/master/src/event-emitter-to-async-iterator.ts
const { EventEmitter } = require("events");

function eventEmitterAsyncIterator(pgListen, eventsNames, commonMessageHandler = message => message) {
  const pullQueue = [];
  const pushQueue = [];
  const eventsArray =
    typeof eventsNames === "string" ? [eventsNames] : eventsNames;
  let listening = true;

  const pushValue = (event) => {
    const value = commonMessageHandler(event);
    if (pullQueue.length !== 0) {
      pullQueue.shift()({ value, done: false });
    } else {
      pushQueue.push(value);
    }
  };

  const pullValue = () => {
    return new Promise(resolve => {
      if (pushQueue.length !== 0) {
        resolve({ value: pushQueue.shift(), done: false });
      } else {
        pullQueue.push(resolve);
      }
    });
  };

  const emptyQueue = () => {
    if (listening) {
      listening = false;
      pullQueue.forEach(resolve => resolve({ value: undefined, done: true }));
      pullQueue.length = 0;
      pushQueue.length = 0;
    }
  };

  const addEventListeners = async () => {
    for (const eventName of eventsArray) {
      pgListen.notifications.on(eventName, pushValue);
    }
  };

  addEventListeners();

  return {
    next() {
      return listening ? pullValue() : this.return();
    },
    return() {
      emptyQueue();

      return Promise.resolve({ value: undefined, done: true });
    },
    throw(error) {
      emptyQueue();

      return Promise.reject(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}

module.exports = {
  eventEmitterAsyncIterator
};
