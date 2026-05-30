const dotenv = require('dotenv'); // Load environment variables from .env file

dotenv.config(); // Initialize dotenv to read the .env file and set process.env variables

// Export the environment configuration as an object
module.exports = { env } = {
  app : {
    port: process.env.PORT || 3000, // Use PORT from environment variables or default to 3000
    nodeEnv: process.env.NODE_ENV || 'development', // Use NODE_ENV from environment variables or default to 'development'
  },

  database : {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'govflow_user',
    password: process.env.DB_PASSWORD || 'govflow_password',
    name: process.env.DB_NAME || 'govflow_db'
  }
  
}