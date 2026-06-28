const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');

const env = require('./config/env');
const logger = require('./config/logger');
const routes = require('./routes');
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

// pino-http generates a per-request req.id, logs method/route/status/duration
// automatically, and exposes a request-scoped logger as req.log for the rest
// of the chain (including error.middleware).
app.use(pinoHttp({ logger }));
app.use((req, res, next) => {
  res.setHeader("X-Request-Id", req.id);
  next();
});

app.use(routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
