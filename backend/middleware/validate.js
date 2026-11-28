import AppError from '../utils/AppError.js';

export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    const firstMsg = details[0]?.message || 'Validation failed';
    return next(new AppError(firstMsg, 400, details));
  }
  req.validatedBody = result.data;
  next();
};
