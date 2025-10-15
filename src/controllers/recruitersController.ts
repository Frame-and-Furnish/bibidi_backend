import { Request, Response } from 'express';
import Joi from 'joi';
import { randomUUID } from 'crypto';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db/connectDB';
import {
  users,
  roles,
  userRoles,
  recruiters,
  recruiterInvitations,
  recruiterEvents,
  providerProfiles,
} from '../db/schema';
import {
  formatError,
  formatSuccess,
  hashPassword,
  sanitizeString,
  isValidEmail,
} from '../utils/helpers';
import { generateToken } from './authController';
import { splitFullName } from '../utils/names';

// Validation schemas
const registerRecruiterSchema = Joi.object({
  fullName: Joi.string().min(2).max(120).required(),
  email: Joi.string().email().required(),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain uppercase, lowercase, and a number',
    }),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
  phone: Joi.string().min(7).max(30).required(),
  city: Joi.string().max(100).required(),
  token: Joi.string().uuid().optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  avatarUrl: Joi.string().uri().optional(),
});

const inviteRecruiterSchema = Joi.object({
  email: Joi.string().email().required(),
  expiresInDays: Joi.number().integer().min(1).max(30).default(7),
});

const updateRecruiterSchema = Joi.object({
  phone: Joi.string().min(7).max(30).optional(),
  city: Joi.string().max(100).optional(),
  status: Joi.string().valid('active', 'away', 'offline', 'pending').optional(),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  avatarUrl: Joi.string().uri().allow(null, ''),
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('active', 'away', 'offline', 'suspended').required(),
});

/**
 * Helper: ensure recruiter role exists and return its id
 */
const getRecruiterRoleId = async (): Promise<number> => {
  const recruiterRole = await db.select().from(roles).where(eq(roles.name, 'recruiter'));

  if (recruiterRole.length === 0) {
    const inserted = await db
      .insert(roles)
      .values({ name: 'recruiter', description: 'Offline recruiter responsible for onboarding service providers' })
      .returning();

    if (!inserted[0]) {
      throw new Error('Failed to create recruiter role');
    }

    return inserted[0].id;
  }

  if (!recruiterRole[0]?.id) {
    throw new Error('Recruiter role missing');
  }

  return recruiterRole[0].id;
};

/**
 * POST /api/recruiters/register
 * Public endpoint to register a recruiter (optionally via invitation token)
 */
export const registerRecruiter = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = registerRecruiterSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    const {
      fullName,
      email,
      password,
      phone,
      city,
      token,
      latitude,
      longitude,
      avatarUrl,
    } = value;

    const normalizedEmail = email.toLowerCase();

    // If invitation token provided, validate it and ensure it matches email
    let invitationId: string | null = null;
    if (token) {
      const invitationResults = await db
        .select()
        .from(recruiterInvitations)
        .where(and(eq(recruiterInvitations.token, token), eq(recruiterInvitations.status, 'pending')));

      const invitation = invitationResults[0];

      if (!invitation) {
        res.status(400).json(formatError('Invitation token is invalid or already used', 'INVALID_INVITE_TOKEN'));
        return;
      }

      if (invitation.email.toLowerCase() !== normalizedEmail) {
        res.status(400).json(formatError('Invitation email mismatch', 'INVITE_EMAIL_MISMATCH'));
        return;
      }

      if (invitation.expiresAt && invitation.expiresAt < new Date()) {
        res.status(400).json(formatError('Invitation token has expired', 'INVITE_EXPIRED'));
        return;
      }

      invitationId = invitation.id;
    }

    // Prevent duplicate accounts
    const existingUser = await db.select().from(users).where(eq(users.email, normalizedEmail));
    if (existingUser.length > 0) {
      res.status(409).json(formatError('An account with this email already exists', 'USER_EXISTS'));
      return;
    }

    const passwordHash = await hashPassword(password);
    const recruiterRoleId = await getRecruiterRoleId();
    const { firstName, lastName } = splitFullName(fullName);

    const insertedUsers = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        password: passwordHash,
        firstName,
        lastName,
      })
      .returning();

    const user = insertedUsers[0];

    if (!user) {
      res.status(500).json(formatError('Failed to create user account', 'USER_CREATION_FAILED'));
      return;
    }

    await db.insert(userRoles).values({
      userId: user.id,
      roleId: recruiterRoleId,
    });

    const recruiterStatus = token ? 'active' : 'pending';

    const insertedRecruiters = await db
      .insert(recruiters)
      .values({
        userId: user.id,
        phone: sanitizeString(phone),
        city: sanitizeString(city),
        status: recruiterStatus,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        avatarUrl: avatarUrl ?? null,
      })
      .returning();

    const recruiter = insertedRecruiters[0];

    if (!recruiter) {
      res.status(500).json(formatError('Failed to create recruiter profile', 'RECRUITER_CREATION_FAILED'));
      return;
    }

    await db.insert(recruiterEvents).values({
      recruiterId: recruiter.id,
      eventType: 'recruiter_registered',
      metadata: {
        viaInvitation: Boolean(token),
        city: recruiter.city,
      },
    });

    if (invitationId) {
      await db
        .update(recruiterInvitations)
        .set({ status: 'accepted', acceptedAt: new Date() })
        .where(eq(recruiterInvitations.id, invitationId));
    }

    const authToken = generateToken(user.id, ['recruiter']);

    res.status(201).json(
      formatSuccess(
        {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            roles: ['recruiter'],
          },
          recruiter,
          token: authToken,
        },
        'Recruiter registered successfully'
      )
    );
  } catch (err) {
    console.error('Register recruiter error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * POST /api/recruiters/invitations
 * Admin endpoint to invite a recruiter by email
 */
export const createRecruiterInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = inviteRecruiterSchema.validate(req.body);
    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    const { email, expiresInDays } = value;
    const normalizedEmail = email.toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      res.status(400).json(formatError('Invalid email address', 'INVALID_EMAIL'));
      return;
    }

    // Check if user already exists
    const existingUser = await db.select().from(users).where(eq(users.email, normalizedEmail));
    if (existingUser.length > 0) {
      res.status(409).json(formatError('A user with this email already exists', 'USER_EXISTS'));
      return;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const token = randomUUID();

    const inserted = await db
      .insert(recruiterInvitations)
      .values({
        email: normalizedEmail,
        token,
        status: 'pending',
        invitedBy: req.user?.userId ?? null,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: recruiterInvitations.email,
        set: {
          token,
          status: 'pending',
          invitedBy: req.user?.userId ?? null,
          expiresAt,
          revokedAt: null,
          acceptedAt: null,
          createdAt: new Date(),
        },
      })
      .returning();

    const invitation = inserted[0];

    res.status(201).json(
      formatSuccess(
        {
          invitation,
        },
        'Recruiter invitation generated'
      )
    );
  } catch (err) {
    console.error('Create recruiter invitation error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * GET /api/recruiters/invitations
 * Admin endpoint to list invitations
 */
export const listRecruiterInvitations = async (req: Request, res: Response): Promise<void> => {
  try {
    const invitations = await db.select().from(recruiterInvitations);
    res.status(200).json(formatSuccess(invitations, 'Recruiter invitations retrieved successfully'));
  } catch (err) {
    console.error('List recruiter invitations error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * PATCH /api/recruiters/invitations/:id/revoke
 */
export const revokeRecruiterInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json(formatError('Invitation ID is required', 'INVITATION_ID_REQUIRED'));
      return;
    }

    const invitationResults = await db.select().from(recruiterInvitations).where(eq(recruiterInvitations.id, id));
    const invitation = invitationResults[0];

    if (!invitation) {
      res.status(404).json(formatError('Invitation not found', 'INVITATION_NOT_FOUND'));
      return;
    }

    if (invitation.status === 'accepted') {
      res.status(400).json(formatError('Cannot revoke an already accepted invitation', 'INVITE_ALREADY_ACCEPTED'));
      return;
    }

    await db
      .update(recruiterInvitations)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(eq(recruiterInvitations.id, id));

    res.status(200).json(formatSuccess({ id }, 'Invitation revoked successfully'));
  } catch (err) {
    console.error('Revoke recruiter invitation error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * GET /api/recruiters
 * Admin endpoint to list recruiters with optional filters
 */
export const listRecruiters = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, city, search } = req.query;

    const whereClauses = [] as any[];
    if (status) {
      whereClauses.push(eq(recruiters.status, String(status)));
    }

    if (city) {
      const cityTerm = `%${String(city)}%`;
      whereClauses.push(ilike(recruiters.city, cityTerm));
    }

    if (search) {
      const searchTerm = `%${String(search)}%`;
      whereClauses.push(
        or(
          ilike(users.firstName, searchTerm),
          ilike(users.lastName, searchTerm),
          ilike(users.email, searchTerm),
          ilike(recruiters.city, searchTerm),
          ilike(recruiters.phone, searchTerm)
        )
      );
    }

    let recruiterQuery = db
      .select({
        id: recruiters.id,
        userId: recruiters.userId,
        phone: recruiters.phone,
        city: recruiters.city,
        status: recruiters.status,
        avatarUrl: recruiters.avatarUrl,
        latitude: recruiters.latitude,
        longitude: recruiters.longitude,
        lastActiveAt: recruiters.lastActiveAt,
        createdAt: recruiters.createdAt,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(recruiters)
      .leftJoin(users, eq(recruiters.userId, users.id))
      .orderBy(sql`${recruiters.createdAt} DESC`);

    if (whereClauses.length > 0) {
      recruiterQuery = recruiterQuery.where(and(...whereClauses));
    }

    const recruiterRows = await recruiterQuery;

    const providerStats = await db
      .select({
        recruiterId: providerProfiles.onboardedBy,
        totalProviders: sql<number>`COUNT(${providerProfiles.id})`,
        pendingProviders: sql<number>`SUM(CASE WHEN ${providerProfiles.status} = 'pending' THEN 1 ELSE 0 END)`
      })
      .from(providerProfiles)
      .where(sql`${providerProfiles.onboardedBy} IS NOT NULL`)
      .groupBy(providerProfiles.onboardedBy);

    const statsByRecruiter = new Map<string, { totalProviders: number; pendingProviders: number }>();
    providerStats.forEach((stat) => {
      if (!stat.recruiterId) return;
      statsByRecruiter.set(stat.recruiterId, {
        totalProviders: Number(stat.totalProviders) || 0,
        pendingProviders: Number(stat.pendingProviders) || 0,
      });
    });

    const data = recruiterRows.map((row) => {
      const stats = statsByRecruiter.get(row.id) ?? { totalProviders: 0, pendingProviders: 0 };
      return {
        id: row.id,
        userId: row.userId,
        name: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(),
        email: row.email,
        phone: row.phone,
        location: row.city,
        coordinates:
          row.latitude !== null && row.longitude !== null
            ? { lat: Number(row.latitude), lng: Number(row.longitude) }
            : null,
        status: row.status,
        avatarUrl: row.avatarUrl,
        lastActiveAt: row.lastActiveAt,
        totalProviders: stats.totalProviders,
        pendingProviders: stats.pendingProviders,
        createdAt: row.createdAt,
      };
    });

    res.status(200).json(formatSuccess(data, 'Recruiters retrieved successfully'));
  } catch (err) {
    console.error('List recruiters error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * GET /api/recruiters/me
 * Recruiter endpoint to fetch their profile and stats
 */
export const getCurrentRecruiterProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    const recruiterRows = await db
      .select({
        recruiter: recruiters,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(recruiters)
      .innerJoin(users, eq(recruiters.userId, users.id))
      .where(eq(recruiters.userId, req.user.userId));

    const row = recruiterRows[0];

    if (!row) {
      res.status(404).json(formatError('Recruiter profile not found', 'RECRUITER_NOT_FOUND'));
      return;
    }

    const stats = await db
      .select({
        totalProviders: sql<number>`COUNT(${providerProfiles.id})`,
        pendingProviders: sql<number>`SUM(CASE WHEN ${providerProfiles.status} = 'pending' THEN 1 ELSE 0 END)`,
      })
      .from(providerProfiles)
      .where(eq(providerProfiles.onboardedBy, row.recruiter.id));

    const { totalProviders, pendingProviders } = stats[0] ?? { totalProviders: 0, pendingProviders: 0 };

    res.status(200).json(
      formatSuccess(
        {
          recruiter: row.recruiter,
          user: row.user,
          stats: {
            totalProviders: Number(totalProviders) || 0,
            pendingProviders: Number(pendingProviders) || 0,
          },
        },
        'Recruiter profile retrieved successfully'
      )
    );
  } catch (err) {
    console.error('Get current recruiter profile error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * PATCH /api/recruiters/me
 * Allow recruiter to update their own profile information
 */
export const updateCurrentRecruiterProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    const { error, value } = updateRecruiterSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    const recruiterRows = await db.select().from(recruiters).where(eq(recruiters.userId, req.user.userId));
    const recruiter = recruiterRows[0];

    if (!recruiter) {
      res.status(404).json(formatError('Recruiter profile not found', 'RECRUITER_NOT_FOUND'));
      return;
    }

    const updates = {
      ...value,
      city: value.city ? sanitizeString(value.city) : value.city,
      phone: value.phone ? sanitizeString(value.phone) : value.phone,
      updatedAt: new Date(),
    };

    const updated = await db
      .update(recruiters)
      .set(updates)
      .where(eq(recruiters.id, recruiter.id))
      .returning();

    await db.insert(recruiterEvents).values({
      recruiterId: recruiter.id,
      eventType: 'profile_updated',
      metadata: {
        updatedFields: Object.keys(value),
      },
    });

    res.status(200).json(formatSuccess(updated[0], 'Recruiter profile updated successfully'));
  } catch (err) {
    console.error('Update current recruiter profile error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * PATCH /api/recruiters/:id/status
 * Admin endpoint to change recruiter status
 */
export const updateRecruiterStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json(formatError('Recruiter ID is required', 'RECRUITER_ID_REQUIRED'));
      return;
    }
    const { error, value } = updateStatusSchema.validate(req.body);

    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    const recruiterRows = await db.select().from(recruiters).where(eq(recruiters.id, id));
    const recruiter = recruiterRows[0];

    if (!recruiter) {
      res.status(404).json(formatError('Recruiter not found', 'RECRUITER_NOT_FOUND'));
      return;
    }

    const updated = await db
      .update(recruiters)
      .set({ status: value.status, updatedAt: new Date() })
      .where(eq(recruiters.id, id))
      .returning();

    await db.insert(recruiterEvents).values({
      recruiterId: recruiter.id,
      eventType: 'status_updated',
      metadata: { status: value.status, updatedBy: req.user?.userId },
    });

    res.status(200).json(formatSuccess(updated[0], 'Recruiter status updated successfully'));
  } catch (err) {
    console.error('Update recruiter status error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};
