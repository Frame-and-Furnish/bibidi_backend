import { Request, Response } from 'express';
import Joi from 'joi';
import { eq, desc, ilike, and, or, sql } from 'drizzle-orm';
import { db } from '../db/connectDB';
import { providerProfiles, users, userRoles, roles, categories } from '../db/schema';
import { formatError, formatSuccess } from '../utils/helpers';

// Validation schema for provider profile creation
const createProviderProfileSchema = Joi.object({
  firstName: Joi.string().max(100).required().messages({
    'string.max': 'First name cannot exceed 100 characters',
    'any.required': 'First name is required'
  }),
  lastName: Joi.string().max(100).required().messages({
    'string.max': 'Last name cannot exceed 100 characters',
    'any.required': 'Last name is required'
  }),
  businessName: Joi.string().max(255).required().messages({
    'string.max': 'Business name cannot exceed 255 characters',
    'any.required': 'Business name is required'
  }),
  description: Joi.string().max(1000).optional(),
  serviceTitle: Joi.string().max(255).required().messages({
    'string.max': 'Service title cannot exceed 255 characters',
    'any.required': 'Service title is required'
  }),
  categoryId: Joi.number().integer().optional(),
  pricePerHour: Joi.number().positive().precision(2).optional(),
  profilePictureURL: Joi.string().uri().optional(),
  portfolioImageURLs: Joi.array().items(Joi.string().uri()).optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  locationString: Joi.string().max(255).optional(),
  nextAvailability: Joi.date().iso().optional(),
});

// Validation schema for provider profile updates
const updateProviderProfileSchema = createProviderProfileSchema.fork(
  ['firstName', 'lastName', 'businessName', 'serviceTitle'],
  (schema) => schema.optional()
);

/**
 * Get all provider profiles
 * GET /api/profiles
 */
export const getProviderProfiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = '1',
      limit = '10',
      search,
      minPrice,
      maxPrice,
      minRating,
      sortBy = 'rating',
      sortOrder = 'desc',
      latitude,
      longitude,
      radius = '50' // Default radius in km
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string))); // Max 50 items per page
    const offset = (pageNum - 1) * limitNum;

    // Build where conditions
    let whereConditions: any[] = [];

    // Search in business name, first name, last name, or service title
    if (search) {
      const searchTerm = `%${search}%`;
      whereConditions.push(
        or(
          ilike(providerProfiles.businessName, searchTerm),
          ilike(providerProfiles.firstName, searchTerm),
          ilike(providerProfiles.lastName, searchTerm),
          ilike(providerProfiles.serviceTitle, searchTerm),
          ilike(providerProfiles.description, searchTerm)
        )
      );
    }

    // Price range filter
    if (minPrice) {
      const minPriceNum = parseFloat(minPrice as string);
      if (!isNaN(minPriceNum)) {
        whereConditions.push(sql`${providerProfiles.pricePerHour} >= ${minPriceNum}`);
      }
    }

    if (maxPrice) {
      const maxPriceNum = parseFloat(maxPrice as string);
      if (!isNaN(maxPriceNum)) {
        whereConditions.push(sql`${providerProfiles.pricePerHour} <= ${maxPriceNum}`);
      }
    }

    // Rating filter
    if (minRating) {
      const minRatingNum = parseFloat(minRating as string);
      if (!isNaN(minRatingNum) && minRatingNum >= 0 && minRatingNum <= 5) {
        whereConditions.push(sql`${providerProfiles.rating} >= ${minRatingNum}`);
      }
    }

    // Base query select
    const baseSelect = {
      id: providerProfiles.id,
      name: sql<string>`CONCAT(${providerProfiles.firstName}, ' ', ${providerProfiles.lastName})`.as('name'),
      businessName: providerProfiles.businessName,
      category: categories.name,
      description: providerProfiles.description,
      ownerName: sql<string>`CONCAT(${providerProfiles.firstName}, ' ', ${providerProfiles.lastName})`.as('ownerName'),
      image: providerProfiles.profilePictureURL,
      profilePictureURL: providerProfiles.profilePictureURL,
      serviceTitle: providerProfiles.serviceTitle,
      pricePerHour: providerProfiles.pricePerHour,
      rating: providerProfiles.rating,
      reviewCount: providerProfiles.reviewCount,
      location: providerProfiles.locationString,
      nextAvailability: providerProfiles.nextAvailability,
      portfolioImageURLs: providerProfiles.portfolioImageURLs,
      latitude: providerProfiles.latitude,
      longitude: providerProfiles.longitude,
      isAvailable: providerProfiles.isAvailable,
      createdAt: providerProfiles.createdAt,
      user: {
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      },
      categoryInfo: {
        id: categories.id,
        name: categories.name,
        icon: categories.icon,
        color: categories.color,
      },
    };

    // Add distance calculation if location provided
    let selectWithDistance = baseSelect;
    let distanceQuery = null;
    
    if (latitude && longitude) {
      const lat = parseFloat(latitude as string);
      const lng = parseFloat(longitude as string);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        distanceQuery = sql`
          (6371 * acos(
            cos(radians(${lat})) 
            * cos(radians(CAST(${providerProfiles.latitude} AS DECIMAL))) 
            * cos(radians(CAST(${providerProfiles.longitude} AS DECIMAL)) - radians(${lng})) 
            + sin(radians(${lat})) 
            * sin(radians(CAST(${providerProfiles.latitude} AS DECIMAL)))
          ))
        `;
        
        selectWithDistance = {
          ...baseSelect,
          distance: sql<string>`CONCAT(ROUND(${distanceQuery}, 1), ' km')`.as('distance')
        } as any;
      }
    }

    let query = db
      .select(selectWithDistance)
      .from(providerProfiles)
      .leftJoin(users, eq(providerProfiles.userId, users.id))
      .leftJoin(categories, eq(providerProfiles.categoryId, categories.id));

    // Apply where conditions
    if (whereConditions.length > 0) {
      query = query.where(and(...whereConditions));
    }

    // Location-based filtering
    if (latitude && longitude && radius && distanceQuery) {
      const radiusKm = parseFloat(radius as string);
      
      if (!isNaN(radiusKm)) {
        query = query.where(sql`${distanceQuery} <= ${radiusKm}`);
      }
    }

    // Apply sorting
    if (sortBy === 'rating') {
      query = sortOrder === 'desc' 
        ? query.orderBy(desc(providerProfiles.rating))
        : query.orderBy(providerProfiles.rating);
    } else if (sortBy === 'pricePerHour') {
      query = sortOrder === 'desc'
        ? query.orderBy(desc(providerProfiles.pricePerHour))
        : query.orderBy(providerProfiles.pricePerHour);
    } else if (sortBy === 'createdAt') {
      query = sortOrder === 'desc'
        ? query.orderBy(desc(providerProfiles.createdAt))
        : query.orderBy(providerProfiles.createdAt);
    } else if (sortBy === 'distance' && distanceQuery) {
      query = sortOrder === 'desc'
        ? query.orderBy(desc(distanceQuery))
        : query.orderBy(distanceQuery);
    }

    // Apply pagination
    query = query.limit(limitNum).offset(offset);

    const profiles = await query;

    // Get total count for pagination
    const totalCountQuery = await db.select().from(providerProfiles);
    const totalCount = totalCountQuery.length;

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json(formatSuccess({
      profiles,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1,
      },
    }, 'Provider profiles retrieved successfully'));

  } catch (error) {
    console.error('Get provider profiles error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Get a single provider profile by ID
 * GET /api/profiles/:id
 */
export const getProviderProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json(formatError('Profile ID is required', 'MISSING_PARAMETER'));
      return;
    }

    const profileResults = await db
      .select({
        id: providerProfiles.id,
        firstName: providerProfiles.firstName,
        lastName: providerProfiles.lastName,
        profilePictureURL: providerProfiles.profilePictureURL,
        serviceTitle: providerProfiles.serviceTitle,
        pricePerHour: providerProfiles.pricePerHour,
        rating: providerProfiles.rating,
        reviewCount: providerProfiles.reviewCount,
        nextAvailability: providerProfiles.nextAvailability,
        portfolioImageURLs: providerProfiles.portfolioImageURLs,
        latitude: providerProfiles.latitude,
        longitude: providerProfiles.longitude,
        createdAt: providerProfiles.createdAt,
        updatedAt: providerProfiles.updatedAt,
        user: {
          id: users.id,
          email: users.email,
        },
      })
      .from(providerProfiles)
      .leftJoin(users, eq(providerProfiles.userId, users.id))
      .where(eq(providerProfiles.id, id));

    const profile = profileResults[0];

    if (!profile) {
      res.status(404).json(formatError('Provider profile not found', 'PROFILE_NOT_FOUND'));
      return;
    }

    res.status(200).json(formatSuccess(profile, 'Provider profile retrieved successfully'));

  } catch (error) {
    console.error('Get provider profile error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Create a provider profile (requires provider role or admin)
 * POST /api/profiles
 */
export const createProviderProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    // Validate input
    const { error, value } = createProviderProfileSchema.validate(req.body);
    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    const { userId } = req.user;

    // Check if user already has a provider profile
    const existingProfile = await db
      .select()
      .from(providerProfiles)
      .where(eq(providerProfiles.userId, userId));

    if (existingProfile.length > 0) {
      res.status(409).json(formatError('Provider profile already exists for this user', 'PROFILE_EXISTS'));
      return;
    }

    // Create the profile
    const newProfile = {
      userId,
      ...value,
    };

    const insertedProfiles = await db.insert(providerProfiles).values(newProfile).returning();
    const insertedProfile = insertedProfiles[0];

    // Add provider role to user if not already present
    const providerRole = await db.select().from(roles).where(eq(roles.name, 'provider'));
    if (providerRole.length > 0 && providerRole[0]) {
      const existingUserRole = await db
        .select()
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, providerRole[0].id)
        ));

      if (existingUserRole.length === 0) {
        await db.insert(userRoles).values({
          userId,
          roleId: providerRole[0].id,
        });
      }
    }

    res.status(201).json(formatSuccess(insertedProfile, 'Provider profile created successfully'));

  } catch (error) {
    console.error('Create provider profile error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Update a provider profile (only owner or admin)
 * PUT /api/profiles/:id
 */
export const updateProviderProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    const { id } = req.params;
    if (!id) {
      res.status(400).json(formatError('Profile ID is required', 'MISSING_PARAMETER'));
      return;
    }

    const { userId, roles: userRoles } = req.user;

    // Validate input
    const { error, value } = updateProviderProfileSchema.validate(req.body);
    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    // Check if profile exists and user has permission to update it
    const profileResults = await db
      .select()
      .from(providerProfiles)
      .where(eq(providerProfiles.id, id));

    const profile = profileResults[0];

    if (!profile) {
      res.status(404).json(formatError('Provider profile not found', 'PROFILE_NOT_FOUND'));
      return;
    }

    // Check if user owns the profile or is an admin
    if (profile.userId !== userId && !userRoles.includes('administrator')) {
      res.status(403).json(formatError('Access denied. You can only update your own profile', 'INSUFFICIENT_PERMISSIONS'));
      return;
    }

    // Update the profile
    const updatedProfiles = await db
      .update(providerProfiles)
      .set({
        ...value,
        updatedAt: new Date(),
      })
      .where(eq(providerProfiles.id, id))
      .returning();

    const updatedProfile = updatedProfiles[0];

    res.status(200).json(formatSuccess(updatedProfile, 'Provider profile updated successfully'));

  } catch (error) {
    console.error('Update provider profile error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};