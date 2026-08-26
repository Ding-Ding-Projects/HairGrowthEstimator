'use strict';

const service = require('./service');

if (require.main === module) {
  service.startFromEnvironment().catch((error) => {
    console.error(`Hair Growth API could not start: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = service;
