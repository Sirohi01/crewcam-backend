import { Request, Response, NextFunction } from 'express';

const OBJECT_ID_FIELDS = ['id', 'candidateId', 'employeeId'];
const isValidObjectId = (value: string) => /^[0-9a-fA-F]{24}$/.test(value);
export const validateObjectIdQuery = (req: Request, res: Response, next: NextFunction) => {
  for (const field of OBJECT_ID_FIELDS) {
    const queryValue = req.query[field];
    if (typeof queryValue === 'string' && !isValidObjectId(queryValue)) {
      return res.status(400).json({ message: `Invalid ${field}` });
    }
  }
  next();
};
export const validateObjectIdParam = (_req: Request, res: Response, next: NextFunction, value: string) => {
  if (!isValidObjectId(value)) {
    return res.status(400).json({ message: 'Invalid id' });
  }
  next();
};
