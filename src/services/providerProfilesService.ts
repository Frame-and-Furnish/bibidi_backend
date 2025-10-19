import { and, eq, ilike } from 'drizzle-orm';
import { db } from '../db/connectDB';
import {
  providerProfiles,
  roles,
  userRoles,
  categories,
} from '../db/schema';

export interface ProviderProfileCreateInput {
  userId: string;
  firstName: string;
  lastName: string;
  businessName: string;
  description?: string | null;
  profilePictureURL?: string | null;
  serviceTitle: string;
  categoryId?: number | null;
  pricePerHour?: string | number | null;
  locationString?: string | null;
  fullAddress?: string | null;
  contactPhone?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  portfolioImageURLs?: string[] | null;
  nextAvailability?: Date | string | null;
  status?: 'pending' | 'active' | 'rejected' | 'suspended';
  onboardedBy?: string | null;
  onboardedAt?: Date | null;
}

export interface ProviderProfileUpdateInput {
  firstName?: string;
  lastName?: string;
  businessName?: string;
  description?: string | null;
  profilePictureURL?: string | null;
  serviceTitle?: string;
  categoryId?: number | null;
  pricePerHour?: string | number | null;
  locationString?: string | null;
  fullAddress?: string | null;
  contactPhone?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  portfolioImageURLs?: string[] | null;
  nextAvailability?: Date | string | null;
  status?: 'pending' | 'active' | 'rejected' | 'suspended';
  onboardedBy?: string | null;
  onboardedAt?: Date | null;
}

export const ensureRoleId = async (roleName: string, description: string): Promise<number> => {
  const existing = await db.select().from(roles).where(eq(roles.name, roleName));
  if (existing[0]?.id) {
    return existing[0].id;
  }

  const inserted = await db
    .insert(roles)
    .values({ name: roleName, description })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]?.id) {
    return inserted[0].id;
  }

  const fallback = await db.select().from(roles).where(eq(roles.name, roleName));
  if (fallback[0]?.id) {
    return fallback[0].id;
  }

  throw new Error(`Failed to ensure role ${roleName}`);
};

export const ensureUserHasRole = async (userId: string, roleId: number): Promise<void> => {
  const existing = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));

  if (existing.length > 0) {
    return;
  }

  await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
};

const toDecimalString = (value?: string | number | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  return value;
};

const toDateValue = (value?: Date | string | null): Date | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export const createProviderProfileRecord = async (
  input: ProviderProfileCreateInput
) => {
  const [profile] = await db
    .insert(providerProfiles)
    .values({
      userId: input.userId,
      firstName: input.firstName,
      lastName: input.lastName,
      businessName: input.businessName,
      description: input.description ?? null,
      profilePictureURL: input.profilePictureURL ?? null,
      serviceTitle: input.serviceTitle,
      categoryId: input.categoryId ?? null,
      pricePerHour: toDecimalString(input.pricePerHour),
      locationString: input.locationString ?? null,
      fullAddress: input.fullAddress ?? null,
      contactPhone: input.contactPhone ?? null,
      latitude: toDecimalString(input.latitude),
      longitude: toDecimalString(input.longitude),
      portfolioImageURLs: input.portfolioImageURLs ?? null,
      nextAvailability: toDateValue(input.nextAvailability),
      status: input.status ?? 'pending',
      onboardedBy: input.onboardedBy ?? null,
      onboardedAt: input.onboardedAt ?? null,
    })
    .returning();

  return profile;
};

export const updateProviderProfileRecord = async (
  profileId: string,
  updates: ProviderProfileUpdateInput
) => {
  const [profile] = await db
    .update(providerProfiles)
    .set({
      ...(updates.businessName !== undefined ? { businessName: updates.businessName } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.profilePictureURL !== undefined ? { profilePictureURL: updates.profilePictureURL } : {}),
      ...(updates.serviceTitle !== undefined ? { serviceTitle: updates.serviceTitle } : {}),
      ...(updates.categoryId !== undefined ? { categoryId: updates.categoryId } : {}),
  ...(updates.firstName !== undefined ? { firstName: updates.firstName } : {}),
  ...(updates.lastName !== undefined ? { lastName: updates.lastName } : {}),
  ...(updates.pricePerHour !== undefined ? { pricePerHour: toDecimalString(updates.pricePerHour) } : {}),
      ...(updates.locationString !== undefined ? { locationString: updates.locationString } : {}),
      ...(updates.fullAddress !== undefined ? { fullAddress: updates.fullAddress } : {}),
      ...(updates.contactPhone !== undefined ? { contactPhone: updates.contactPhone } : {}),
      ...(updates.latitude !== undefined ? { latitude: toDecimalString(updates.latitude) } : {}),
      ...(updates.longitude !== undefined ? { longitude: toDecimalString(updates.longitude) } : {}),
  ...(updates.portfolioImageURLs !== undefined ? { portfolioImageURLs: updates.portfolioImageURLs } : {}),
  ...(updates.nextAvailability !== undefined ? { nextAvailability: toDateValue(updates.nextAvailability) } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      ...(updates.onboardedBy !== undefined ? { onboardedBy: updates.onboardedBy } : {}),
      ...(updates.onboardedAt !== undefined ? { onboardedAt: updates.onboardedAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(providerProfiles.id, profileId))
    .returning();

  return profile;
};

export const ensureCategoryByName = async (name: string): Promise<number | null> => {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  const existing = await db.select().from(categories).where(ilike(categories.name, trimmed));
  if (existing[0]?.id) {
    return existing[0].id;
  }

  const inserted = await db
    .insert(categories)
    .values({
      name: trimmed,
      icon: '🛠️',
      color: '#2563eb',
    })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]?.id) {
    return inserted[0].id;
  }

  const fallback = await db.select().from(categories).where(ilike(categories.name, trimmed));
  return fallback[0]?.id ?? null;
};
