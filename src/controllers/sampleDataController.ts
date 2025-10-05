import { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/connectDB';
import { categories, services, providerProfiles, users, userRoles, roles, NewCategory, NewService, NewProviderProfile, NewUser, NewUserRole } from '../db/schema';
import { formatError, formatSuccess } from '../utils/helpers';
import { hashPassword } from '../utils/helpers';

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

    // Create sample provider users and profiles
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
          categoryId: 1,
          pricePerHour: '85',
          rating: '4.8',
          reviewCount: 25,
          latitude: '49.8880',
          longitude: '-119.4960',
          locationString: 'Downtown Kelowna',
          profilePictureURL: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
          portfolioImageURLs: ['https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=300&h=200&fit=crop'],
          isAvailable: 1
        }
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
          categoryId: 2,
          pricePerHour: '75',
          rating: '4.9',
          reviewCount: 32,
          latitude: '49.8940',
          longitude: '-119.4900',
          locationString: 'Midtown Kelowna',
          profilePictureURL: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&h=150&fit=crop&crop=face',
          portfolioImageURLs: ['https://images.unsplash.com/photo-1613844044163-1ad2f2d0b152?q=80&w=1740&auto=format&fit=crop'],
          isAvailable: 1
        }
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
          categoryId: 6,
          pricePerHour: '65',
          rating: '4.7',
          reviewCount: 18,
          latitude: '49.8820',
          longitude: '-119.5020',
          locationString: 'Westside Kelowna',
          profilePictureURL: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
          portfolioImageURLs: ['https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=300&h=200&fit=crop'],
          isAvailable: 0
        }
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
        
        // Ensure user exists before proceeding
        if (!user) {
          console.error('Failed to create user');
          continue;
        }

        // Assign provider role
        const providerRole = await db.select().from(roles).where(eq(roles.name, 'provider'));
        if (providerRole.length === 0) {
          await db.insert(roles).values({ name: 'provider' }).onConflictDoNothing();
        }
        
        const roleResults = await db.select().from(roles).where(eq(roles.name, 'provider'));
        if (roleResults.length > 0 && roleResults[0]) {
          const newUserRole: NewUserRole = {
            userId: user.id,
            roleId: roleResults[0].id
          };
          await db.insert(userRoles).values(newUserRole).onConflictDoNothing();
        }

        // Create provider profile
        if (user.firstName && user.lastName) {
          const newProfile: NewProviderProfile = {
            userId: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            ...providerData.profile
          };

          const profileResults = await db
            .insert(providerProfiles)
            .values(newProfile)
            .onConflictDoNothing()
            .returning();

          if (profileResults.length > 0) {
            insertedProviders.push({
              user,
              profile: profileResults[0]
            });
          }
        }
      }
    }

    res.status(201).json(formatSuccess({
      categories: insertedCategories.length,
      services: insertedServices.length,
      providers: insertedProviders.length,
      message: 'Sample data initialized successfully'
    }, 'Sample data initialization completed'));

  } catch (error) {
    console.error('Initialize sample data error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};