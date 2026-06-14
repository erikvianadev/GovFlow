const dotenv = require("dotenv"); // Load environment variables from .env file

dotenv.config(); // Initialize dotenv to read the .env file and set process.env variables

// Export the environment configuration as an object
const env = {
  app: {
    port: process.env.PORT || 3000, // Use PORT from environment variables or default to 3000
    nodeEnv: process.env.NODE_ENV || "development", // Use NODE_ENV from environment variables or default to 'development'
  },

  database: { // database configuration using environment variables with defaults
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || "govflow_user",
    password: process.env.DB_PASSWORD || "govflow_password",
    name: process.env.DB_NAME || "govflow_db",
  },

  jwt: { // JWT configuration using environment variables with defaults
    secret:
      process.env.JWT_SECRET || "govflow_development_secret_change_later",
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  },

  redis: { // Redis configuration using environment variables with defaults
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
};

module.exports = env;
