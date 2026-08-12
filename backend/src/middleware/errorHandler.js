'use strict';

/**
 * Global error handler middleware.
 * Must be the LAST middleware registered in Express.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[Error]', err.stack || err.message);

  // Foreign key violation against the acting user's own id (e.g. a session left open
  // for an account that was since deleted) — treat as an invalid session instead of
  // leaking a raw Postgres constraint name to the client.
  if (err.code === '23503' && err.constraint?.includes('user_id')) {
    return res.status(401).json({ message: 'Your session is no longer valid. Please log in again.' });
  }

  const status = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' && status === 500
      ? 'An internal server error occurred.'
      : err.message || 'An internal server error occurred.';

  res.status(status).json({ message });
}

module.exports = { errorHandler };
