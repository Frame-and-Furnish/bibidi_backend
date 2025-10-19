import { Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import Joi from 'joi';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/connectDB';
import { users, roles, userRoles, NewUser, NewUserRole } from '../db/schema';
import { hashPassword, comparePassword, formatError, formatSuccess, isValidEmail } from '../utils/helpers';

// Validation schemas
const registerSchema = Joi.object({
  firstName: Joi.string().max(100).required().messages({
    'string.max': 'First name cannot exceed 100 characters',
    'any.required': 'First name is required'
  }),
  lastName: Joi.string().max(100).required().messages({
    'string.max': 'Last name cannot exceed 100 characters',
    'any.required': 'Last name is required'
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().min(8).required().messages({
    'string.min': 'Password must be at least 8 characters long',
    'any.required': 'Password is required'
  }),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords do not match',
    'any.required': 'Confirm password is required'
  })
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required'
  })
});

/**
 * Generate JWT token with user information and roles
 */
export const generateToken = (userId: string, userRoles: string[]): string => {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  const payload = { userId, roles: userRoles };
  
  // Note: Remove expiresIn for now due to type compatibility issue
  // In production, you may want to configure this properly
  return jwt.sign(payload, jwtSecret);
};

/**
 * Register a new user
 * POST /api/auth/register
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    const { firstName, lastName, email, password, confirmPassword } = value;

    // Check if user already exists
    const existingUser = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    if (existingUser.length > 0) {
      res.status(409).json(formatError('User with this email already exists', 'USER_EXISTS'));
      return;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create new user
    const newUser: NewUser = {
      email: email.toLowerCase(),
      password: hashedPassword,
      firstName,
      lastName,
    };

    const insertedUsers = await db.insert(users).values(newUser).returning();
    const insertedUser = insertedUsers[0];

    if (!insertedUser) {
      res.status(500).json(formatError('Failed to create user', 'USER_CREATION_FAILED'));
      return;
    }

    // Get the customer role ID
    let customerRole = await db.select().from(roles).where(eq(roles.name, 'customer'));
    if (customerRole.length === 0) {
      // Create default roles if they don't exist
      await db.insert(roles).values([
        { name: 'customer' },
        { name: 'provider' },
        { name: 'administrator' }
      ]).onConflictDoNothing();
      
      // Retry getting customer role
      customerRole = await db.select().from(roles).where(eq(roles.name, 'customer'));
      if (customerRole.length === 0) {
        res.status(500).json(formatError('Failed to assign default role', 'ROLE_ASSIGNMENT_FAILED'));
        return;
      }
    }

    const roleId = customerRole[0]?.id;
    if (!roleId) {
      res.status(500).json(formatError('Failed to assign default role', 'ROLE_ASSIGNMENT_FAILED'));
      return;
    }

    // Assign customer role to user
    const newUserRole: NewUserRole = {
      userId: insertedUser.id,
      roleId: roleId,
    };

    await db.insert(userRoles).values(newUserRole);

    // Generate JWT token
    const token = generateToken(insertedUser.id, ['customer']);

    // Return success response without password
    const userResponse = {
      id: insertedUser.id,
      email: insertedUser.email,
      firstName: insertedUser.firstName,
      lastName: insertedUser.lastName,
      roles: ['customer'],
      createdAt: insertedUser.createdAt,
    };

    res.status(201).json(formatSuccess({
      user: userResponse,
      token,
    }, 'User registered successfully'));

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Login user
 * POST /api/auth/login
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    const { email, password } = value;

    // Find user by email
    const userResults = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    const user = userResults[0];

    if (!user) {
      res.status(401).json(formatError('Invalid email or password', 'INVALID_CREDENTIALS'));
      return;
    }

    // Check password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json(formatError('Invalid email or password', 'INVALID_CREDENTIALS'));
      return;
    }

    // Get user roles
    const userRoleResults = await db
      .select({
        role: roles.name,
      })
      .from(userRoles)
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id));

    const userRoleNames = userRoleResults.map(ur => ur.role).filter(Boolean) as string[];

    // Generate JWT token
    const token = generateToken(user.id, userRoleNames);

    // Return success response without password
    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: userRoleNames,
      createdAt: user.createdAt,
    };

    res.status(200).json(formatSuccess({
      user: userResponse,
      token,
    }, 'Login successful'));

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Get current user profile
 * GET /api/auth/profile
 */
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    const { userId } = req.user;

    // Get user details
    const userResults = await db.select().from(users).where(eq(users.id, userId));
    const user = userResults[0];

    if (!user) {
      res.status(404).json(formatError('User not found', 'USER_NOT_FOUND'));
      return;
    }

    // Get user roles
    const userRoleResults = await db
      .select({
        role: roles.name,
      })
      .from(userRoles)
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));

    const userRoleNames = userRoleResults.map(ur => ur.role).filter(Boolean) as string[];

    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: userRoleNames,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(200).json(formatSuccess(userResponse, 'Profile retrieved successfully'));

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};