'use strict';

/**
 * Global error handler middleware.
 * Must be the LAST middleware registered in Express.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[Error]', err.stack || err.message);

  const status = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' && status === 500
      ? 'An internal server error occurred.'
      : err.message || 'An internal server error occurred.';

  res.status(status).json({ message });
}

module.exports = { errorHandler };
