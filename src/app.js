const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const env = require('./config/env');
const routes = require('./routes');
const requestLoggerMiddleware = require('./middlewares/request-logger.middleware');
const notFoundMiddleware = require('./middlewares/not-found.middleware');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();

// Trust exactly the configured number of reverse proxies (default 0 = none) so
// per-IP rate limiting keys on the real client IP. Never set to `true`, which
// would let clients spoof X-Forwarded-For and bypass the limiter.
app.set("trust proxy", env.app.trustProxyHops);

const corsOptions = {
  origin(origin, callback) {
    // Allow requests without an Origin header (server-to-server, curl, health
    // checks) and origins present in the configured allowlist.
    if (!origin || env.app.corsOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed by CORS"));
  },
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "100kb" }));

app.use(requestLoggerMiddleware);

app.use(routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
