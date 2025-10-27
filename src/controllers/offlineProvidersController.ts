import type { Request, Response, Express } from 'express';
import Joi from 'joi';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db/connectDB';
import {
  users,
  recruiters,
  providerProfiles,
  categories,
  recruiterEvents,
} from '../db/schema';
import {
  hashPassword,
  generateRandomString,
  sanitizeString,
  formatError,
  formatSuccess,
} from '../utils/helpers';
import { splitFullName } from '../utils/names';
import {
  ensureRoleId,
  ensureUserHasRole,
  ensureCategoryByName,
  createProviderProfileRecord,
  updateProviderProfileRecord,
} from '../services/providerProfilesService';
import type { ProviderProfileUpdateInput } from '../services/providerProfilesService';
import {
  insertProviderDocuments,
  getProviderDocuments,
  deleteProviderDocumentRecord,
} from '../services/providerDocumentsService';
import { storageService } from '../utils/storage';

const createProviderSchema = Joi.object({
  fullName: Joi.string().max(120).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().max(30).required(),
  serviceCategory: Joi.string().max(100).required(),
  city: Joi.string().max(120).required(),
  pricePerHour: Joi.number().min(0).optional().allow(null),
  fullAddress: Joi.string().max(255).allow('', null),
  bio: Joi.string().max(1000).allow('', null),
  profilePictureUrl: Joi.string().uri().allow('', null),
  recruiterId: Joi.string().uuid().optional(),
  latitude: Joi.number().min(-90).max(90).optional().allow(null),
  longitude: Joi.number().min(-180).max(180).optional().allow(null),
  documents: Joi.array()
    .items(
      Joi.object({
        documentType: Joi.string().max(50).required(),
        fileUrl: Joi.string().uri().required(),
        storageKey: Joi.string().max(500).optional(),
        fileName: Joi.string().max(255).optional(),
        mimeType: Joi.string().max(180).optional(),
        fileSize: Joi.number().integer().min(0).optional(),
      })
    )
    .optional(),
});

const updateProviderSchema = Joi.object({
  phone: Joi.string().max(30).optional(),
  city: Joi.string().max(120).optional(),
  fullAddress: Joi.string().max(255).allow('', null),
  bio: Joi.string().max(1000).allow('', null),
  profilePictureUrl: Joi.string().uri().allow('', null),
  pricePerHour: Joi.number().min(0).optional().allow(null),
  status: Joi.string().valid('pending', 'active', 'rejected', 'suspended').optional(),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  serviceCategory: Joi.string().max(100).optional(),
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'active', 'rejected', 'suspended').required(),
});

const attachDocumentsSchema = Joi.object({
  documents: Joi.array()
    .items(
      Joi.object({
        documentType: Joi.string().max(50).required(),
        fileUrl: Joi.string().uri().required(),
        storageKey: Joi.string().max(500).optional(),
        fileName: Joi.string().max(255).optional(),
        mimeType: Joi.string().max(180).optional(),
        fileSize: Joi.number().integer().min(0).optional(),
      })
    )
    .min(1)
    .required(),
});

const uploadDocumentSchema = Joi.object({
  documentType: Joi.string().max(50).required(),
});

type DocumentPayload = {
  documentType: string;
  fileUrl: string;
  storageKey?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

const resolveRecruiterId = async (req: Request, bodyRecruiterId?: string): Promise<string> => {
  const isAdmin = req.user?.roles.includes('administrator');
  const isRecruiter = req.user?.roles.includes('recruiter');

  if (isRecruiter) {
    const recruiterRows = await db.select().from(recruiters).where(eq(recruiters.userId, req.user!.userId));
    const recruiter = recruiterRows[0];
    if (!recruiter) {
      throw new Error('RECRUITER_PROFILE_NOT_FOUND');
    }
    return recruiter.id;
  }

  if (isAdmin) {
    if (!bodyRecruiterId) {
      throw new Error('RECRUITER_ID_REQUIRED');
    }
    const recruiterRows = await db.select().from(recruiters).where(eq(recruiters.id, bodyRecruiterId));
    if (!recruiterRows[0]) {
      throw new Error('RECRUITER_NOT_FOUND');
    }
    return bodyRecruiterId;
  }

  throw new Error('INSUFFICIENT_PERMISSIONS');
};

/**
 * POST /api/offline/providers
 * Recruiters create new provider profiles
 */
export const createOfflineProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    const { error, value } = createProviderSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    let recruiterId: string;
    try {
      recruiterId = await resolveRecruiterId(req, value.recruiterId);
    } catch (resolveError: any) {
      const code = String(resolveError.message || resolveError);
      const messageMap: Record<string, string> = {
        RECRUITER_PROFILE_NOT_FOUND: 'Recruiter profile not found for current user',
        RECRUITER_ID_REQUIRED: 'Recruiter ID is required when creating providers as an administrator',
        RECRUITER_NOT_FOUND: 'Recruiter not found',
        INSUFFICIENT_PERMISSIONS: 'Only recruiters and administrators can onboard providers',
      };
      res.status(code === 'INSUFFICIENT_PERMISSIONS' ? 403 : 400).json(
        formatError(messageMap[code] ?? 'Unable to resolve recruiter context', code)
      );
      return;
    }

    const {
      fullName,
      email,
  phone,
      serviceCategory,
      city,
      pricePerHour,
      fullAddress,
      bio,
      profilePictureUrl,
      latitude,
      longitude,
      documents,
    } = value;

    const normalizedEmail = email.toLowerCase();
    const providerRoleId = await ensureRoleId('provider', 'Service provider role');

  const existingUsers = await db.select().from(users).where(eq(users.email, normalizedEmail));
    let user = existingUsers[0];
    let temporaryPassword: string | null = null;

    const { firstName, lastName } = splitFullName(fullName);

    if (!user) {
      temporaryPassword = process.env.PROVIDER_TEMPPASSWORD ?? generateRandomString(12); //generateRandomString(12);
      const passwordHash = await hashPassword(temporaryPassword);

      const insertedUsers = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          password: passwordHash,
          firstName,
          lastName,
        })
        .returning();

      user = insertedUsers[0];
      if (!user) {
        res.status(500).json(formatError('Failed to create provider user', 'USER_CREATION_FAILED'));
        return;
      }
    } else {
      const existingProfiles = await db
        .select()
        .from(providerProfiles)
        .where(eq(providerProfiles.userId, user.id));

      if (existingProfiles[0]) {
        res.status(409).json(formatError('Provider profile already exists for this email', 'PROVIDER_EXISTS'));
        return;
      }
    }

    await ensureUserHasRole(user.id, providerRoleId);

    const categoryId = await ensureCategoryByName(serviceCategory);

    const businessName = `${sanitizeString(fullName)} ${sanitizeString(serviceCategory)} Services`.trim();

    const provider = await createProviderProfileRecord({
      userId: user.id,
      firstName,
      lastName,
      businessName,
      description: bio ? sanitizeString(bio) : null,
      profilePictureURL: profilePictureUrl ?? null,
      serviceTitle: sanitizeString(serviceCategory),
      categoryId,
      pricePerHour,
      locationString: sanitizeString(city),
      fullAddress: fullAddress ? sanitizeString(fullAddress) : null,
      contactPhone: sanitizeString(phone),
      latitude,
      longitude,
      status: 'pending',
      onboardedBy: recruiterId,
      onboardedAt: new Date(),
    });
    if (!provider) {
      res.status(500).json(formatError('Failed to create provider profile', 'PROVIDER_CREATION_FAILED'));
      return;
    }

    const documentsPayload = documents as DocumentPayload[] | undefined;

    if (documentsPayload && documentsPayload.length > 0) {
      await insertProviderDocuments(
        documentsPayload.map((doc) => ({
          providerId: provider.id,
          documentType: doc.documentType,
          storageKey: doc.storageKey ?? null,
          fileUrl: doc.fileUrl,
          fileName: doc.fileName ?? null,
          mimeType: doc.mimeType ?? null,
          fileSize: doc.fileSize ?? null,
          uploadedBy: recruiterId,
        }))
      );
    }

    await db.insert(recruiterEvents).values({
      recruiterId,
      eventType: 'provider_onboarded',
      metadata: {
        providerId: provider.id,
        serviceCategory,
      },
    });

    res.status(201).json(
      formatSuccess(
        {
          provider,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          },
          temporaryPassword,
        },
        'Provider onboarded successfully'
      )
    );
  } catch (err) {
    console.error('Create offline provider error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * GET /api/offline/providers
 * List providers with filters/pagination
 */
export const listOfflineProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    const {
      status,
      recruiterId,
      category,
      city,
      search,
      page = '1',
      limit = '10',
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(String(limit), 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const filters: any[] = [];

    if (status) {
      filters.push(eq(providerProfiles.status, String(status)));
    }

    if (recruiterId) {
      filters.push(eq(providerProfiles.onboardedBy, String(recruiterId)));
    }

    if (city) {
      const cityTerm = `%${String(city)}%`;
      filters.push(ilike(providerProfiles.locationString, cityTerm));
    }

    if (category) {
      const categoryTerm = `%${String(category)}%`;
      filters.push(or(ilike(providerProfiles.serviceTitle, categoryTerm), ilike(categories.name, categoryTerm)));
    }

    if (search) {
      const searchTerm = `%${String(search)}%`;
      filters.push(
        or(
          ilike(providerProfiles.firstName, searchTerm),
          ilike(providerProfiles.lastName, searchTerm),
          ilike(providerProfiles.businessName, searchTerm),
          ilike(users.email, searchTerm)
        )
      );
    }

    let baseQuery = db
      .select({
        provider: providerProfiles,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
        category: {
          id: categories.id,
          name: categories.name,
        },
      })
      .from(providerProfiles)
      .leftJoin(users, eq(providerProfiles.userId, users.id))
      .leftJoin(categories, eq(providerProfiles.categoryId, categories.id))
      .orderBy(desc(providerProfiles.createdAt))
      .limit(limitNum)
      .offset(offset);

    let countQuery = db
      .select({ total: sql<number>`COUNT(*)` })
      .from(providerProfiles)
      .leftJoin(users, eq(providerProfiles.userId, users.id))
      .leftJoin(categories, eq(providerProfiles.categoryId, categories.id));

    if (filters.length > 0) {
      const combined = and(...filters);
      baseQuery = baseQuery.where(combined);
      countQuery = countQuery.where(combined);
    }

    const providersData = await baseQuery;
    const countResult = await countQuery;
    const totalCount = Number(countResult[0]?.total ?? 0);

    const recruiterIds = Array.from(
      new Set(
        providersData
          .map((row) => row.provider.onboardedBy)
          .filter((id): id is string => Boolean(id))
      )
    );

    let recruitersMap = new Map<string, { id: string; name: string; email: string | null }>();
    if (recruiterIds.length > 0) {
      const recruiterRows = await db
        .select({
          id: recruiters.id,
          phone: recruiters.phone,
          city: recruiters.city,
          status: recruiters.status,
          userId: recruiters.userId,
          userEmail: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(recruiters)
        .leftJoin(users, eq(recruiters.userId, users.id))
        .where(inArray(recruiters.id, recruiterIds));

      recruitersMap = new Map(
        recruiterRows.map((row) => [
          row.id,
          {
            id: row.id,
            name: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(),
            email: row.userEmail,
          },
        ])
      );
    }

    const data = providersData.map((row) => {
      const recruiterInfo = row.provider.onboardedBy
        ? recruitersMap.get(row.provider.onboardedBy)
        : undefined;

      const userEmail = row.user?.email ?? null;

      return {
        id: row.provider.id,
        status: row.provider.status,
        firstName: row.provider.firstName,
        lastName: row.provider.lastName,
        serviceTitle: row.provider.serviceTitle,
        category: row.category?.name,
        pricePerHour: row.provider.pricePerHour ? Number(row.provider.pricePerHour) : null,
        location: row.provider.locationString,
        fullAddress: row.provider.fullAddress,
        phone: row.provider.contactPhone,
        email: userEmail,
        recruiter: recruiterInfo,
        totalEarnings: row.provider.totalEarnings ? Number(row.provider.totalEarnings) : 0,
        totalCommission: row.provider.totalCommission ? Number(row.provider.totalCommission) : 0,
        createdAt: row.provider.createdAt,
      };
    });

    const pendingCountQuery = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(providerProfiles)
      .where(eq(providerProfiles.status, 'pending'));

    const activeCountQuery = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(providerProfiles)
      .where(eq(providerProfiles.status, 'active'));

    const summary = {
      total: totalCount,
      pending: Number(pendingCountQuery[0]?.count ?? 0),
      active: Number(activeCountQuery[0]?.count ?? 0),
    };

    res.status(200).json(
      formatSuccess(
        {
          providers: data,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limitNum) || 1,
          },
          summary,
        },
        'Providers retrieved successfully'
      )
    );
  } catch (err) {
    console.error('List offline providers error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * GET /api/offline/providers/:id
 */
export const getOfflineProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;

    if (!id) {
      res.status(400).json(formatError('Provider ID is required', 'PROVIDER_ID_REQUIRED'));
      return;
    }

    const providerRows = await db
      .select({
        provider: providerProfiles,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
        category: {
          id: categories.id,
          name: categories.name,
        },
      })
      .from(providerProfiles)
      .leftJoin(users, eq(providerProfiles.userId, users.id))
      .leftJoin(categories, eq(providerProfiles.categoryId, categories.id))
      .where(eq(providerProfiles.id, id));

    const row = providerRows[0];

    if (!row) {
      res.status(404).json(formatError('Provider not found', 'PROVIDER_NOT_FOUND'));
      return;
    }

    const userInfo = row.user
      ? {
          id: row.user.id,
          email: row.user.email,
          firstName: row.user.firstName,
          lastName: row.user.lastName,
        }
      : null;

    const documents = await getProviderDocuments(id);

    let recruiterInfo: { id: string; name: string; email: string | null } | undefined;
    if (row.provider.onboardedBy) {
      const recruiterRows = await db
        .select({
          id: recruiters.id,
          userEmail: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(recruiters)
        .leftJoin(users, eq(recruiters.userId, users.id))
        .where(eq(recruiters.id, row.provider.onboardedBy));

      const recruiter = recruiterRows[0];
      if (recruiter) {
        recruiterInfo = {
          id: recruiter.id,
          email: recruiter.userEmail,
          name: `${recruiter.firstName ?? ''} ${recruiter.lastName ?? ''}`.trim(),
        };
      }
    }

    res.status(200).json(
      formatSuccess(
        {
          provider: row.provider,
          user: userInfo,
          category: row.category,
          documents,
          recruiter: recruiterInfo,
        },
        'Provider retrieved successfully'
      )
    );
  } catch (err) {
    console.error('Get offline provider error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * PATCH /api/offline/providers/:id
 */
export const updateOfflineProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    const { id } = req.params;

    if (!id) {
      res.status(400).json(formatError('Provider ID is required', 'PROVIDER_ID_REQUIRED'));
      return;
    }

    const { error, value } = updateProviderSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    const providerRows = await db.select().from(providerProfiles).where(eq(providerProfiles.id, id));
    const provider = providerRows[0];

    if (!provider) {
      res.status(404).json(formatError('Provider not found', 'PROVIDER_NOT_FOUND'));
      return;
    }

    const isAdmin = req.user.roles.includes('administrator');
    const isRecruiter = req.user.roles.includes('recruiter');

    if (isRecruiter && provider.onboardedBy) {
      const recruiterRows = await db.select().from(recruiters).where(eq(recruiters.userId, req.user.userId));
      const recruiter = recruiterRows[0];
      if (!recruiter || recruiter.id !== provider.onboardedBy) {
        res.status(403).json(formatError('You can only update providers you onboarded', 'INSUFFICIENT_PERMISSIONS'));
        return;
      }
    }

    if (!isAdmin && !isRecruiter) {
      res.status(403).json(formatError('Access denied', 'INSUFFICIENT_PERMISSIONS'));
      return;
    }

    const updatePayload: ProviderProfileUpdateInput = {};

    if (value.phone) {
      updatePayload.contactPhone = sanitizeString(value.phone);
    }

    if (value.city) {
      updatePayload.locationString = sanitizeString(value.city);
    }

    if (value.fullAddress !== undefined) {
      updatePayload.fullAddress = value.fullAddress ? sanitizeString(value.fullAddress) : null;
    }

    if (value.bio !== undefined) {
      updatePayload.description = value.bio ? sanitizeString(value.bio) : null;
    }

    if (value.profilePictureUrl !== undefined) {
      updatePayload.profilePictureURL = value.profilePictureUrl || null;
    }

    if (value.pricePerHour !== undefined) {
      updatePayload.pricePerHour = value.pricePerHour ?? null;
    }

    if (value.latitude !== undefined) {
      updatePayload.latitude = value.latitude;
    }

    if (value.longitude !== undefined) {
      updatePayload.longitude = value.longitude;
    }

    if (typeof value.serviceCategory === 'string') {
      const sanitizedCategory = sanitizeString(value.serviceCategory);
      if (sanitizedCategory) {
        updatePayload.serviceTitle = sanitizedCategory;
        updatePayload.categoryId = await ensureCategoryByName(sanitizedCategory);
      }
    }

    if (value.status && isAdmin) {
      updatePayload.status = value.status;
    }

    const updatedProfile = await updateProviderProfileRecord(id, updatePayload);

    if (!updatedProfile) {
      res.status(500).json(formatError('Failed to update provider profile', 'PROVIDER_UPDATE_FAILED'));
      return;
    }

    res.status(200).json(formatSuccess(updatedProfile, 'Provider updated successfully'));
  } catch (err) {
    console.error('Update offline provider error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * PATCH /api/offline/providers/:id/status
 */
export const updateOfflineProviderStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    if (!req.user.roles.includes('administrator')) {
      res.status(403).json(formatError('Administrator privileges required', 'INSUFFICIENT_PERMISSIONS'));
      return;
    }

    const idParam = req.params.id;
    const { error, value } = updateStatusSchema.validate(req.body);

    if (!idParam) {
      res.status(400).json(formatError('Provider ID is required', 'PROVIDER_ID_REQUIRED'));
      return;
    }

    const id = idParam;

    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

  const providerRows = await db.select().from(providerProfiles).where(eq(providerProfiles.id, id));
    const provider = providerRows[0];

    if (!provider) {
      res.status(404).json(formatError('Provider not found', 'PROVIDER_NOT_FOUND'));
      return;
    }

    const updatedProfile = await updateProviderProfileRecord(id, { status: value.status });

    if (!updatedProfile) {
      res.status(500).json(formatError('Failed to update provider status', 'PROVIDER_STATUS_UPDATE_FAILED'));
      return;
    }

    res.status(200).json(formatSuccess(updatedProfile, 'Provider status updated successfully'));
  } catch (err) {
    console.error('Update offline provider status error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * POST /api/offline/providers/:id/documents/upload
 * Upload a provider document and persist metadata
 */
export const uploadProviderDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    const { id } = req.params as { id: string };

    const providerRows = await db.select().from(providerProfiles).where(eq(providerProfiles.id, id));
    const provider = providerRows[0];

    if (!provider) {
      res.status(404).json(formatError('Provider not found', 'PROVIDER_NOT_FOUND'));
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json(formatError('A file is required', 'FILE_REQUIRED'));
      return;
    }

    const { error, value } = uploadDocumentSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    const storedFile = await storageService.saveFile({
      buffer: file.buffer,
      originalName: file.originalname,
      folder: `providers/${id}/documents`,
      contentType: file.mimetype,
    });

    let uploaderRecruiterId: string | null = null;
    if (req.user.roles.includes('recruiter')) {
      const recruiterRow = await db
        .select({ id: recruiters.id })
        .from(recruiters)
        .where(eq(recruiters.userId, req.user.userId));
      uploaderRecruiterId = recruiterRow[0]?.id ?? null;
    }

    const insertedDocs = await insertProviderDocuments([
      {
        providerId: id,
        documentType: value.documentType,
        storageKey: storedFile.key,
        fileUrl: storedFile.url,
        fileName: storedFile.fileName,
        mimeType: storedFile.mimeType ?? file.mimetype ?? null,
        fileSize: storedFile.size,
        uploadedBy: uploaderRecruiterId,
      },
    ]);

    const document = insertedDocs[0];

    if (!document) {
      res.status(500).json(formatError('Failed to save document metadata', 'DOCUMENT_SAVE_FAILED'));
      return;
    }

    if (uploaderRecruiterId) {
      await db.insert(recruiterEvents).values({
        recruiterId: uploaderRecruiterId,
        eventType: 'provider_document_uploaded',
        metadata: {
          providerId: id,
          documentId: document.id,
          documentType: value.documentType,
        },
      });
    }

    res.status(201).json(formatSuccess(document, 'Document uploaded successfully'));
  } catch (err) {
    console.error('Upload provider document error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * POST /api/offline/providers/:id/documents
 * Attach documents (expects metadata already generated by upload service)
 */
export const attachProviderDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json(formatError('Provider ID is required', 'PROVIDER_ID_REQUIRED'));
      return;
    }
    const { error, value } = attachDocumentsSchema.validate(req.body, { abortEarly: false });

    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    const providerRows = await db.select().from(providerProfiles).where(eq(providerProfiles.id, id));
    if (!providerRows[0]) {
      res.status(404).json(formatError('Provider not found', 'PROVIDER_NOT_FOUND'));
      return;
    }

    const recruiterId = req.user?.roles.includes('recruiter')
      ? (
          await db
            .select({ id: recruiters.id })
            .from(recruiters)
            .where(eq(recruiters.userId, req.user!.userId))
        )[0]?.id ?? null
      : null;

    const documentPayload = value.documents as DocumentPayload[];

    const docsToInsert = documentPayload.map((doc) => ({
      providerId: id,
      documentType: doc.documentType,
      storageKey: doc.storageKey ?? null,
      fileUrl: doc.fileUrl,
      fileName: doc.fileName ?? null,
      mimeType: doc.mimeType ?? null,
      fileSize: doc.fileSize ?? null,
      uploadedBy: recruiterId,
    }));

    const insertedDocs = await insertProviderDocuments(docsToInsert);

    res.status(201).json(formatSuccess(insertedDocs, 'Documents attached successfully'));
  } catch (err) {
    console.error('Attach provider documents error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * DELETE /api/offline/providers/:providerId/documents/:documentId
 */
export const deleteProviderDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { providerId, documentId } = req.params as { providerId: string; documentId: string };

    const document = await deleteProviderDocumentRecord(providerId, documentId);
    if (!document) {
      res.status(404).json(formatError('Document not found', 'DOCUMENT_NOT_FOUND'));
      return;
    }

    if (document.storageKey) {
      await storageService.deleteFile(document.storageKey);
    }

    res.status(200).json(formatSuccess({ id: documentId }, 'Document removed successfully'));
  } catch (err) {
    console.error('Delete provider document error:', err);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};
