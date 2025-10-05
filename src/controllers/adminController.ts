import { Request, Response } from 'express';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/connectDB';
import { users, roles, userRoles, providerProfiles } from '../db/schema';
import { formatError, formatSuccess } from '../utils/helpers';

/**
 * Get all users (admin only)
 * GET /api/admin/users
 */
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = '1',
      limit = '10',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    // Get all users with their roles
    const usersResults = await db
      .select({
        user: {
          id: users.id,
          email: users.email,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        }
      })
      .from(users)
      .orderBy(sortOrder === 'desc' ? desc(users.createdAt) : users.createdAt)
      .limit(limitNum)
      .offset(offset);

    // Get roles for each user
    const usersWithRoles = await Promise.all(
      usersResults.map(async ({ user }) => {
        const userRoleResults = await db
          .select({
            role: roles.name,
          })
          .from(userRoles)
          .leftJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.userId, user.id));

        const userRoleNames = userRoleResults.map(ur => ur.role).filter(Boolean) as string[];

        return {
          ...user,
          roles: userRoleNames,
        };
      })
    );

    // Get total count for pagination
    const totalCountQuery = await db.select().from(users);
    const totalCount = totalCountQuery.length;
    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json(formatSuccess({
      users: usersWithRoles,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    }, 'Users retrieved successfully'));

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Get user by ID (admin only)
 * GET /api/admin/users/:id
 */
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json(formatError('User ID is required', 'MISSING_PARAMETER'));
      return;
    }

    // Get user details
    const userResults = await db.select().from(users).where(eq(users.id, id));
    const user = userResults[0];

    if (!user) {
      res.status(404).json(formatError('User not found', 'USER_NOT_FOUND'));
      return;
    }

    // Get user roles
    const userRoleResults = await db
      .select({
        roleId: roles.id,
        roleName: roles.name,
      })
      .from(userRoles)
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, id));

    const userRoleData = userRoleResults.map(ur => ({
      id: ur.roleId,
      name: ur.roleName,
    })).filter(r => r.name);

    // Get provider profile if exists
    let providerProfile = null;
    const providerProfileResults = await db
      .select()
      .from(providerProfiles)
      .where(eq(providerProfiles.userId, id));

    if (providerProfileResults.length > 0) {
      providerProfile = providerProfileResults[0];
    }

    const userResponse = {
      id: user.id,
      email: user.email,
      roles: userRoleData,
      providerProfile,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(200).json(formatSuccess(userResponse, 'User details retrieved successfully'));

  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Delete user (admin only)
 * DELETE /api/admin/users/:id
 */
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json(formatError('User ID is required', 'MISSING_PARAMETER'));
      return;
    }

    // Check if user exists
    const userResults = await db.select().from(users).where(eq(users.id, id));
    const user = userResults[0];

    if (!user) {
      res.status(404).json(formatError('User not found', 'USER_NOT_FOUND'));
      return;
    }

    // Prevent admin from deleting themselves
    if (req.user && req.user.userId === id) {
      res.status(400).json(formatError('Cannot delete your own account', 'CANNOT_DELETE_SELF'));
      return;
    }

    // Delete user (cascading delete will handle userRoles and providerProfiles)
    await db.delete(users).where(eq(users.id, id));

    res.status(200).json(formatSuccess(
      { deletedUserId: id },
      'User deleted successfully'
    ));

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Assign role to user (admin only)
 * POST /api/admin/users/:id/roles
 */
export const assignRoleToUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { roleName } = req.body;

    if (!id) {
      res.status(400).json(formatError('User ID is required', 'MISSING_PARAMETER'));
      return;
    }

    if (!roleName) {
      res.status(400).json(formatError('Role name is required', 'VALIDATION_ERROR'));
      return;
    }

    // Check if user exists
    const userResults = await db.select().from(users).where(eq(users.id, id));
    if (userResults.length === 0) {
      res.status(404).json(formatError('User not found', 'USER_NOT_FOUND'));
      return;
    }

    // Check if role exists
    const roleResults = await db.select().from(roles).where(eq(roles.name, roleName));
    if (roleResults.length === 0) {
      res.status(404).json(formatError('Role not found', 'ROLE_NOT_FOUND'));
      return;
    }

    const role = roleResults[0];
    if (!role) {
      res.status(404).json(formatError('Role not found', 'ROLE_NOT_FOUND'));
      return;
    }

    // Check if user already has this role
    const existingUserRole = await db
      .select()
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, id),
        eq(userRoles.roleId, role.id)
      ));

    if (existingUserRole.length > 0) {
      res.status(409).json(formatError('User already has this role', 'ROLE_ALREADY_ASSIGNED'));
      return;
    }

    // Assign role to user
    await db.insert(userRoles).values({
      userId: id,
      roleId: role.id,
    });

    res.status(200).json(formatSuccess(
      { userId: id, roleName },
      'Role assigned to user successfully'
    ));

  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Remove role from user (admin only)
 * DELETE /api/admin/users/:id/roles/:roleName
 */
export const removeRoleFromUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, roleName } = req.params;

    if (!id) {
      res.status(400).json(formatError('User ID is required', 'MISSING_PARAMETER'));
      return;
    }

    if (!roleName) {
      res.status(400).json(formatError('Role name is required', 'MISSING_PARAMETER'));
      return;
    }

    // Check if user exists
    const userResults = await db.select().from(users).where(eq(users.id, id));
    if (userResults.length === 0) {
      res.status(404).json(formatError('User not found', 'USER_NOT_FOUND'));
      return;
    }

    // Check if role exists
    const roleResults = await db.select().from(roles).where(eq(roles.name, roleName));
    if (roleResults.length === 0) {
      res.status(404).json(formatError('Role not found', 'ROLE_NOT_FOUND'));
      return;
    }

    const role = roleResults[0];
    if (!role) {
      res.status(404).json(formatError('Role not found', 'ROLE_NOT_FOUND'));
      return;
    }

    // Remove role from user
    const deletedRoles = await db
      .delete(userRoles)
      .where(and(
        eq(userRoles.userId, id),
        eq(userRoles.roleId, role.id)
      ))
      .returning();

    if (deletedRoles.length === 0) {
      res.status(404).json(formatError('User does not have this role', 'USER_ROLE_NOT_FOUND'));
      return;
    }

    res.status(200).json(formatSuccess(
      { userId: id, roleName },
      'Role removed from user successfully'
    ));

  } catch (error) {
    console.error('Remove role error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Get system statistics (admin only)
 * GET /api/admin/stats
 */
export const getSystemStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get total counts
    const totalUsers = await db.select().from(users);
    const totalProviderProfiles = await db.select().from(providerProfiles);

    // Get role distribution
    const roleStats = await db
      .select({
        roleName: roles.name,
        count: userRoles.roleId,
      })
      .from(userRoles)
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .groupBy(roles.name, userRoles.roleId);

    // Process role stats
    const roleDistribution = roleStats.reduce((acc: any, stat) => {
      if (stat.roleName) {
        acc[stat.roleName] = (acc[stat.roleName] || 0) + 1;
      }
      return acc;
    }, {});

    const stats = {
      totalUsers: totalUsers.length,
      totalProviders: totalProviderProfiles.length,
      totalCustomers: totalUsers.length - totalProviderProfiles.length,
      roleDistribution,
      lastUpdated: new Date().toISOString(),
    };

    res.status(200).json(formatSuccess(stats, 'System statistics retrieved successfully'));

  } catch (error) {
    console.error('Get system stats error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};