// Drop structured log records so they don't flood the test output.
const log = console.log;
console.log = (...args) => {
  if (typeof args[0] === "string" && args[0].startsWith('{"severity"')) {
    return;
  }
  log(...args);
};
