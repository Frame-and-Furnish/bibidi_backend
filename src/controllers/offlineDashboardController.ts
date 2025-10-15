import { Request, Response } from 'express';
import { db } from '../db/connectDB';
import {
  providerProfiles,
  recruiters,
  recruiterEvents,
  users,
  categories,
} from '../db/schema';
import { formatError, formatSuccess } from '../utils/helpers';
import { desc, eq, sql } from 'drizzle-orm';

/**
 * GET /api/offline/dashboard/overview
 */
export const getOfflineDashboardOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    const [overviewAggregate] = await db
      .select({
        totalProviders: sql<number>`COUNT(*)`,
        activeProviders: sql<number>`SUM(CASE WHEN ${providerProfiles.status} = 'active' THEN 1 ELSE 0 END)` ,
        pendingProviders: sql<number>`SUM(CASE WHEN ${providerProfiles.status} = 'pending' THEN 1 ELSE 0 END)` ,
        totalEarnings: sql<string>`COALESCE(SUM(${providerProfiles.totalEarnings}), '0')`,
        totalCommission: sql<string>`COALESCE(SUM(${providerProfiles.totalCommission}), '0')`,
      })
      .from(providerProfiles);

    const aggregates = overviewAggregate ?? {
      totalProviders: 0,
      activeProviders: 0,
      pendingProviders: 0,
      totalEarnings: '0',
      totalCommission: '0',
    };

    const providersByCity = await db
      .select({
        city: providerProfiles.locationString,
        count: sql<number>`COUNT(*)`,
      })
      .from(providerProfiles)
      .groupBy(providerProfiles.locationString)
      .orderBy(desc(sql`COUNT(*)`));

    const recruiterStats = await db
      .select({
        recruiterId: recruiters.id,
        name: sql<string>`TRIM(CONCAT(COALESCE(${users.firstName}, ''), ' ', COALESCE(${users.lastName}, '')))` ,
        email: users.email,
        totalProviders: sql<number>`COUNT(${providerProfiles.id})`,
        activeProviders: sql<number>`SUM(CASE WHEN ${providerProfiles.status} = 'active' THEN 1 ELSE 0 END)` ,
        pendingProviders: sql<number>`SUM(CASE WHEN ${providerProfiles.status} = 'pending' THEN 1 ELSE 0 END)` ,
      })
      .from(recruiters)
      .leftJoin(users, eq(recruiters.userId, users.id))
      .leftJoin(providerProfiles, eq(providerProfiles.onboardedBy, recruiters.id))
      .groupBy(recruiters.id, users.firstName, users.lastName, users.email)
      .orderBy(desc(sql`COUNT(${providerProfiles.id})`));

    const recentProviders = await db
      .select({
        id: providerProfiles.id,
        firstName: providerProfiles.firstName,
        lastName: providerProfiles.lastName,
        status: providerProfiles.status,
        serviceTitle: providerProfiles.serviceTitle,
        categoryName: categories.name,
        createdAt: providerProfiles.createdAt,
      })
      .from(providerProfiles)
      .leftJoin(categories, eq(providerProfiles.categoryId, categories.id))
      .orderBy(desc(providerProfiles.createdAt))
      .limit(6);

    const overview = {
      summary: {
        totalProviders: Number(aggregates.totalProviders) || 0,
        activeProviders: Number(aggregates.activeProviders) || 0,
        pendingProviders: Number(aggregates.pendingProviders) || 0,
        totalEarnings: Number(aggregates.totalEarnings) || 0,
        walletBalance: Number(aggregates.totalCommission) || 0,
      },
      providersByCity: providersByCity.map((row) => ({
        city: row.city ?? 'Unknown',
        count: Number(row.count) || 0,
      })),
      recruiterStats: recruiterStats.map((row) => ({
        recruiterId: row.recruiterId,
        name: row.name.trim(),
        email: row.email,
        totalProviders: Number(row.totalProviders) || 0,
        activeProviders: Number(row.activeProviders) || 0,
        pendingProviders: Number(row.pendingProviders) || 0,
      })),
      recentProviders,
    };

    res.status(200).json(formatSuccess(overview, 'Offline dashboard overview retrieved successfully'));
  } catch (err) {
    console.error('Get offline dashboard overview error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * GET /api/offline/dashboard/activity
 */
export const getOfflineDashboardActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    const events = await db
      .select({
        id: recruiterEvents.id,
        recruiterId: recruiterEvents.recruiterId,
        eventType: recruiterEvents.eventType,
        metadata: recruiterEvents.metadata,
        createdAt: recruiterEvents.createdAt,
        recruiterName: sql<string>`TRIM(CONCAT(COALESCE(${users.firstName}, ''), ' ', COALESCE(${users.lastName}, '')))` ,
      })
      .from(recruiterEvents)
      .leftJoin(recruiters, eq(recruiterEvents.recruiterId, recruiters.id))
      .leftJoin(users, eq(recruiters.userId, users.id))
      .orderBy(desc(recruiterEvents.createdAt))
      .limit(25);

    res.status(200).json(formatSuccess(events, 'Offline activity feed retrieved successfully'));
  } catch (err) {
    console.error('Get offline dashboard activity error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};
