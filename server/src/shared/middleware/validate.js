import { BadRequestError } from '../errors/AppError.js';

export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const formattedErrors = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message
      }));
      return next(new BadRequestError('Validation failed', formattedErrors));
    }
    req.validatedBody = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const formattedErrors = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message
      }));
      return next(new BadRequestError('Query validation failed', formattedErrors));
    }
    req.validatedQuery = result.data;
    next();
  };
}

export const validate = validateBody;

