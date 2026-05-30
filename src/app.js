const express = require('express');
const cors = require('cors');

const routes = require('./routes');
const requestLoggerMiddleware = require('./middlewares/request-logger.middleware');
const notFoundMiddleware = require('./middlewares/not-found.middleware');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();

app.use(cors());
app.use(express.json());

app.use(requestLoggerMiddleware);

app.use(routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
