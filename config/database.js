// Shared PostgreSQL options for Express, connection checks, and migrations.
exports.getDatabaseOptions = (env = process.env) => {
  const port = Number(env.DB_PORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be an integer between 1 and 65535.');
  }
  return {
    host: env.DB_HOST || '127.0.0.1',
    port,
    database: env.DB_NAME || 'hopedb',
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
};
