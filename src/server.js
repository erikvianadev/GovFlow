const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');

app.listen(env.app.port, () => {
  logger.info(
    { port: env.app.port, nodeEnv: env.app.nodeEnv },
    "Server is running"
  );
})