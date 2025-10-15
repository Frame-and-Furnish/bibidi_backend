import { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/connectDB';
import { 
  categories, 
  services, 
  providerProfiles, 
  users, 
  userRoles, 
  roles, 
  recruiters,
  recruiterEvents,
  NewCategory, 
  NewService, 
  NewUser, 
  NewUserRole,
  NewRecruiter 
} from '../db/schema';
import { formatError, formatSuccess, hashPassword } from '../utils/helpers';
import {
  ensureRoleId,
  ensureUserHasRole,
  ensureCategoryByName,
  createProviderProfileRecord,
} from '../services/providerProfilesService';
import { insertProviderDocuments } from '../services/providerDocumentsService';

/**
 * Initialize sample data for development
 * POST /api/admin/init-sample-data
 */
export const initializeSampleData = async (req: Request, res: Response): Promise<void> => {
  try {
    // Initialize categories
    const defaultCategories: NewCategory[] = [
      { name: 'Builder', icon: '🏗️', color: '#4A90E2' },
      { name: 'Painting', icon: '🎨', color: '#7ED321' },
      { name: 'Carpenter', icon: '🔨', color: '#FFC107' },
      { name: 'Plumber', icon: '🔧', color: '#FF5722' },
      { name: 'Electrician', icon: '⚡', color: '#9C27B0' },
      { name: 'Gardener', icon: '🌱', color: '#455A64' },
      { name: 'Cleaner', icon: '🧹', color: '#2196F3' },
      { name: 'AC Repair', icon: '❄️', color: '#00BCD4' },
      { name: 'Flooring', icon: '🏠', color: '#FF9800' },
      { name: 'Roofing', icon: '🏘️', color: '#FFEB3B' },
    ];

    const insertedCategories = await db
      .insert(categories)
      .values(defaultCategories)
      .onConflictDoNothing()
      .returning();

    // Initialize default services
    const defaultServices: Omit<NewService, 'categoryId'>[] = [
      { name: 'Carpentry', description: 'Custom furniture and woodworking services', duration: 120, basePrice: '150' },
      { name: 'Plumbing', description: '24/7 emergency plumbing and maintenance', duration: 90, basePrice: '120' },
      { name: 'Painting', description: 'Interior and exterior painting specialists', duration: 180, basePrice: '200' },
      { name: 'Electrical Work', description: 'Residential and commercial electrical services', duration: 60, basePrice: '100' },
      { name: 'HVAC Repair', description: 'Heating, ventilation, and air conditioning services', duration: 90, basePrice: '130' },
      { name: 'Flooring Installation', description: 'Professional flooring installation and repair', duration: 240, basePrice: '300' },
      { name: 'Roofing', description: 'Roof repair and installation services', duration: 300, basePrice: '400' },
      { name: 'Tiling', description: 'Tile installation and repair services', duration: 150, basePrice: '180' },
      { name: 'Window Installation', description: 'Window installation and repair services', duration: 120, basePrice: '160' },
      { name: 'Door Installation', description: 'Door installation and repair services', duration: 90, basePrice: '140' },
    ];

    const servicesToInsert: NewService[] = defaultServices.map(service => ({
      ...service,
      categoryId: null
    }));

    const insertedServices = await db
      .insert(services)
      .values(servicesToInsert)
      .onConflictDoNothing()
      .returning();

    // Create sample admin and recruiter users
    const adminUser = await db
      .insert(users)
      .values({
        email: 'admin@bibidi.com',
        password: await hashPassword('admin123'),
        firstName: 'Admin',
        lastName: 'User'
      })
      .onConflictDoNothing()
      .returning();

    if (adminUser.length > 0 && adminUser[0]) {
      const adminRoleId = await ensureRoleId('administrator', 'System administrator role');
      await ensureUserHasRole(adminUser[0].id, adminRoleId);
    }

    const recruiterUser = await db
      .insert(users)
      .values({
        email: 'recruiter@bibidi.com',
        password: await hashPassword('recruiter123'),
        firstName: 'Jane',
        lastName: 'Recruiter'
      })
      .onConflictDoNothing()
      .returning();

    let sampleRecruiterId: string | null = null;
    if (recruiterUser.length > 0 && recruiterUser[0]) {
      const recruiterRoleId = await ensureRoleId('recruiter', 'Offline team recruiter role');
      await ensureUserHasRole(recruiterUser[0].id, recruiterRoleId);

      const recruiterProfile = await db
        .insert(recruiters)
        .values({
          userId: recruiterUser[0].id,
          phone: '+1-604-555-0100',
          city: 'Kelowna, BC',
          status: 'active',
          latitude: '49.8880',
          longitude: '-119.4960'
        })
        .onConflictDoNothing()
        .returning();

      sampleRecruiterId = recruiterProfile[0]?.id || null;
    }

    // Create sample provider users and profiles using shared services
    const sampleProviders = [
      {
        user: {
          email: 'mike.johnson@example.com',
          password: await hashPassword('password123'),
          firstName: 'Mike',
          lastName: 'Johnson'
        },
        profile: {
          businessName: 'Elite Construction',
          description: 'Professional construction and renovation services',
          serviceTitle: 'Builder',
          serviceCategory: 'Builder',
          pricePerHour: 85,
          rating: '4.8',
          reviewCount: 25,
          latitude: 49.8880,
          longitude: -119.4960,
          locationString: 'Downtown Kelowna',
          profilePictureURL: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
          portfolioImageURLs: ['https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=300&h=200&fit=crop'],
          isAvailable: 1,
          onboardedBy: sampleRecruiterId
        },
        documents: [
          {
            documentType: 'contractor_license',
            fileUrl: 'https://example.com/docs/mike-license.pdf',
            storageKey: 'providers/mike-johnson/contractor-license.pdf',
            fileName: 'ContractorLicense.pdf',
            mimeType: 'application/pdf',
            fileSize: 245600
          },
          {
            documentType: 'insurance_certificate',
            fileUrl: 'https://example.com/docs/mike-insurance.pdf',
            storageKey: 'providers/mike-johnson/insurance.pdf',
            fileName: 'Insurance.pdf',
            mimeType: 'application/pdf',
            fileSize: 189400
          }
        ]
      },
      {
        user: {
          email: 'sarah.williams@example.com',
          password: await hashPassword('password123'),
          firstName: 'Sarah',
          lastName: 'Williams'
        },
        profile: {
          businessName: 'Color Masters',
          description: 'Interior and exterior painting specialists',
          serviceTitle: 'Painting',
          serviceCategory: 'Painting',
          pricePerHour: 75,
          rating: '4.9',
          reviewCount: 32,
          latitude: 49.8940,
          longitude: -119.4900,
          locationString: 'Midtown Kelowna',
          profilePictureURL: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&h=150&fit=crop&crop=face',
          portfolioImageURLs: ['https://images.unsplash.com/photo-1613844044163-1ad2f2d0b152?q=80&w=1740&auto=format&fit=crop'],
          isAvailable: 1,
          onboardedBy: sampleRecruiterId
        },
        documents: [
          {
            documentType: 'business_license',
            fileUrl: 'https://example.com/docs/sarah-business.pdf',
            storageKey: 'providers/sarah-williams/business-license.pdf',
            fileName: 'BusinessLicense.pdf',
            mimeType: 'application/pdf',
            fileSize: 167800
          }
        ]
      },
      {
        user: {
          email: 'david.chen@example.com',
          password: await hashPassword('password123'),
          firstName: 'David',
          lastName: 'Chen'
        },
        profile: {
          businessName: 'Green Thumb Landscaping',
          description: 'Landscape design and garden maintenance',
          serviceTitle: 'Gardener',
          serviceCategory: 'Gardener',
          pricePerHour: 65,
          rating: '4.7',
          reviewCount: 18,
          latitude: 49.8820,
          longitude: -119.5020,
          locationString: 'Westside Kelowna',
          profilePictureURL: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
          portfolioImageURLs: ['https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=300&h=200&fit=crop'],
          isAvailable: 0,
          onboardedBy: null // Self-serve provider
        },
        documents: [] // No documents for self-serve
      }
    ];

    const insertedProviders = [];

    for (const providerData of sampleProviders) {
      // Create user
      const newUser: NewUser = providerData.user;
      const userResults = await db
        .insert(users)
        .values(newUser)
        .onConflictDoNothing()
        .returning();

      if (userResults.length > 0) {
        const user = userResults[0];
        
        if (!user) {
          console.error('Failed to create user');
          continue;
        }

        // Ensure provider role using shared service
        const providerRoleId = await ensureRoleId('provider', 'Service provider role');
        await ensureUserHasRole(user.id, providerRoleId);

        // Get category ID from service category name
        const categoryId = await ensureCategoryByName(providerData.profile.serviceCategory);

        // Create provider profile using shared service
        const profile = await createProviderProfileRecord({
          userId: user.id,
          firstName: user.firstName!,
          lastName: user.lastName!,
          businessName: providerData.profile.businessName,
          description: providerData.profile.description,
          profilePictureURL: providerData.profile.profilePictureURL,
          serviceTitle: providerData.profile.serviceTitle,
          categoryId,
          pricePerHour: providerData.profile.pricePerHour,
          locationString: providerData.profile.locationString,
          latitude: providerData.profile.latitude,
          longitude: providerData.profile.longitude,
          portfolioImageURLs: providerData.profile.portfolioImageURLs,
          status: 'active',
          onboardedBy: providerData.profile.onboardedBy,
          onboardedAt: providerData.profile.onboardedBy ? new Date() : null,
        });

        if (profile) {
          // Add documents if any
          if (providerData.documents.length > 0) {
            await insertProviderDocuments(
              providerData.documents.map(doc => ({
                providerId: profile.id,
                documentType: doc.documentType,
                fileUrl: doc.fileUrl,
                storageKey: doc.storageKey,
                fileName: doc.fileName,
                mimeType: doc.mimeType,
                fileSize: doc.fileSize,
                uploadedBy: providerData.profile.onboardedBy
              }))
            );
          }

          // Log recruiter event if onboarded by recruiter
          if (providerData.profile.onboardedBy && sampleRecruiterId) {
            await db.insert(recruiterEvents).values({
              recruiterId: sampleRecruiterId,
              eventType: 'provider_onboarded',
              metadata: {
                providerId: profile.id,
                serviceCategory: providerData.profile.serviceCategory,
              },
            });
          }

          insertedProviders.push({
            user,
            profile
          });
        }
      }
    }

    res.status(201).json(formatSuccess({
      categories: insertedCategories.length,
      services: insertedServices.length,
      providers: insertedProviders.length,
      recruiter: sampleRecruiterId ? 'Created sample recruiter' : 'No recruiter created',
      admin: adminUser.length > 0 ? 'Created admin user' : 'No admin created',
      message: 'Sample data initialized successfully with offline team features'
    }, 'Sample data initialization completed'));

  } catch (error) {
    console.error('Initialize sample data error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};