import AppError from '../utils/AppError.js';
import { recordSystemLog } from '../services/auditService.js';

export const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let details = err.details || undefined;

  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err.code === 11000) {
    statusCode = 409;
    const fields = Object.keys(err.keyPattern || {});
    message = `Duplicate value for ${fields.join(', ')}`;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    message = `File upload error: ${err.message}`;
  }

  if (process.env.NODE_ENV !== 'production' && statusCode >= 500) {
    console.error('[ERROR]', err);
  }

  // Record API, auth, DB, and server errors safely (skip noisy 404 probes)
  if (statusCode !== 404) {
    const category =
      statusCode === 401 || statusCode === 403
        ? 'auth_failure'
        : statusCode === 400 || err.name === 'ValidationError'
          ? 'validation'
          : err.name?.includes('Mongo')
            ? 'database'
            : statusCode >= 500
              ? 'api_error'
              : 'application';
    recordSystemLog({
      severity: statusCode >= 500 ? 'error' : statusCode === 401 || statusCode === 403 ? 'security' : 'warn',
      category,
      endpoint: req.originalUrl,
      method: req.method,
      httpStatus: statusCode,
      employeeId: req.user?._id || null,
      module: req.originalUrl.split('/')[2] || 'api',
      message,
      stackTrace: statusCode >= 500 ? err.stack : '',
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
};
