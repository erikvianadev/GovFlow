const app = require('./app');
const env = require('./config/env');

app.listen(env.app.port, () => {
  console.log(`Server is running on port ${env.app.port} in ${env.app.nodeEnv} mode.`);
})