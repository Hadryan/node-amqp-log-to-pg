const AMQP = require('simple-amqplib');
const CustomMigrationSource = require('./migration-source');
const debug = require('debug')('amqp-log-to-pg');
const onMessage = require('./on-message');
const ow = require('ow');

const validateConfig = config => {
  ow(config, ow.object.partialShape({
    amqp: ow.object.exactShape({
      url: ow.string.url,
      exchange: ow.string.nonEmpty,
      queue: ow.object.exactShape({
        name: ow.string.nonEmpty,
        routingKey: ow.string.nonEmpty
      })
    }),
    db: ow.string.url,
    tableName: ow.string.nonEmpty
  }));
};

let amqp;
let knex;
let tableName;
async function init (config) {
  validateConfig(config);

  tableName = config.tableName;
  knex = require('knex')(config.db);
  amqp = new AMQP(config.amqp);
  debug('running migrations...');
  await knex.migrate.latest({ migrationSource: new CustomMigrationSource(config.tableName) });
  debug('connecting to AMQP...');
  await amqp.connect();
  debug('ready...');
}

function consume () {
  amqp.consume(onMessage(knex, tableName));
}

async function shutdown () {
  debug('shutting down amqp...');
  try {
    await amqp.close();
  } catch (error) {
    error.log(error);
  }

  debug('shutting down knex...');
  try {
    await knex.destroy();
  } catch (error) {
    error.log(error);
  }
}

module.exports = { init, consume, shutdown };
