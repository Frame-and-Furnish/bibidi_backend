import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { formatError } from '../utils/helpers';

// Extend Request interface to include user data
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        roles: string[];
      };
    }
  }
}

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user information to request object
 */
export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json(formatError('Access token is required', 'MISSING_TOKEN'));
    return;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('JWT_SECRET environment variable is not set');
    res.status(500).json(formatError('Internal server error', 'CONFIGURATION_ERROR'));
    return;
  }

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      let errorMessage = 'Invalid or expired token';
      let errorCode = 'INVALID_TOKEN';
      
      if (err.name === 'TokenExpiredError') {
        errorMessage = 'Token has expired';
        errorCode = 'EXPIRED_TOKEN';
      } else if (err.name === 'JsonWebTokenError') {
        errorMessage = 'Invalid token format';
        errorCode = 'MALFORMED_TOKEN';
      }
      
      res.status(403).json(formatError(errorMessage, errorCode));
      return;
    }

    // Attach user information to request object
    const payload = decoded as { userId: string; roles: string[] };
    req.user = {
      userId: payload.userId,
      roles: payload.roles,
    };

    next();
  });
};

/**
 * Optional Authentication Middleware
 * Similar to authenticateToken but doesn't fail if no token is provided
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // No token provided, but that's okay for optional auth
    next();
    return;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('JWT_SECRET environment variable is not set');
    next();
    return;
  }

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      // Token is invalid, but we don't fail for optional auth
      next();
      return;
    }

    // Attach user information to request object
    const payload = decoded as { userId: string; roles: string[] };
    req.user = {
      userId: payload.userId,
      roles: payload.roles,
    };

    next();
  });
};