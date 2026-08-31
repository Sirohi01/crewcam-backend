import { Request, Response, NextFunction } from 'express';

const OBJECT_ID_FIELDS = ['id', 'candidateId', 'employeeId'];
const isValidObjectId = (value: string) => /^[0-9a-fA-F]{24}$/.test(value);
const DUMMY_OBJECT_ID = '000000000000000000000000';

export const validateObjectIdQuery = (req: Request, res: Response, next: NextFunction) => {
  for (const field of OBJECT_ID_FIELDS) {
    const queryValue = req.query[field];
    if (typeof queryValue === 'string' && !isValidObjectId(queryValue)) {
      // Allow mock slugs (like manish-kumar-sirohi) to pass through as dummy object ids
      req.query[field] = DUMMY_OBJECT_ID;
    }
  }
  next();
};

export const validateObjectIdParam = (req: Request, res: Response, next: NextFunction, value: string, name: string) => {
  if (!isValidObjectId(value)) {
    // Rewrite invalid slugs to a valid dummy ObjectId to prevent 400/500 crashes
    req.params[name] = DUMMY_OBJECT_ID;
  }
  next();
};
