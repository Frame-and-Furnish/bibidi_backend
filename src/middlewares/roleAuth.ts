import { Request, Response, NextFunction } from 'express';
import { formatError } from '../utils/helpers';

/**
 * Role-based Access Control Middleware
 * This is a higher-order function that creates middleware to check if user has required roles
 */
export const hasRole = (requiredRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Check if user is authenticated first
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    const { roles: userRoles } = req.user;

    // Check if user has any of the required roles
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      res.status(403).json(
        formatError(
          `Access denied. Required roles: ${requiredRoles.join(' or ')}`,
          'INSUFFICIENT_PERMISSIONS'
        )
      );
      return;
    }

    next();
  };
};

/**
 * Check if user has ALL specified roles (instead of any)
 */
export const hasAllRoles = (requiredRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    const { roles: userRoles } = req.user;

    // Check if user has all required roles
    const hasAllRequiredRoles = requiredRoles.every(role => userRoles.includes(role));

    if (!hasAllRequiredRoles) {
      res.status(403).json(
        formatError(
          `Access denied. Required roles: ${requiredRoles.join(' and ')}`,
          'INSUFFICIENT_PERMISSIONS'
        )
      );
      return;
    }

    next();
  };
};

/**
 * Check if user is the owner of a resource or has admin privileges
 * This middleware expects userId to be in req.params.userId
 */
export const isOwnerOrAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
    return;
  }

  const { userId: requestUserId, roles } = req.user;
  const targetUserId = req.params.userId;

  // Allow if user is admin or is accessing their own resource
  if (roles.includes('administrator') || requestUserId === targetUserId) {
    next();
    return;
  }

  res.status(403).json(
    formatError('Access denied. You can only access your own resources', 'INSUFFICIENT_PERMISSIONS')
  );
};

/**
 * Middleware to check if user has provider role and is accessing their own profile
 */
export const isProviderOrAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
    return;
  }

  const { roles } = req.user;

  if (roles.includes('administrator') || roles.includes('provider')) {
    next();
    return;
  }

  res.status(403).json(
    formatError('Access denied. Provider or administrator role required', 'INSUFFICIENT_PERMISSIONS')
  );
};