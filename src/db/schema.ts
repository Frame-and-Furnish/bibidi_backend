import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  timestamp,
  decimal,
  integer,
  primaryKey,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Roles table - Defines available roles in the system
export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
});

// Categories table - Service categories
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  icon: varchar('icon', { length: 10 }).notNull(),
  color: varchar('color', { length: 7 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Users table - Core user information
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// UserRoles join table - Many-to-many relationship between users and roles
export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey(table.userId, table.roleId),
  })
);

// Provider profiles table - Extended information for users with provider role
export const providerProfiles = pgTable('provider_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  businessName: varchar('business_name', { length: 255 }).notNull(),
  description: text('description'),
  profilePictureURL: text('profile_picture_url'),
  serviceTitle: varchar('service_title', { length: 255 }).notNull(),
  categoryId: integer('category_id')
    .references(() => categories.id, { onDelete: 'set null' }),
  pricePerHour: decimal('price_per_hour', { precision: 10, scale: 2 }),
  rating: decimal('rating', { precision: 2, scale: 1 }).default('0.0'),
  reviewCount: integer('review_count').default(0),
  nextAvailability: timestamp('next_availability'),
  portfolioImageURLs: text('portfolio_image_urls').array(),
  // Using two decimal columns for location (can be replaced with PostGIS point in production)
  latitude: decimal('latitude', { precision: 10, scale: 8 }),
  longitude: decimal('longitude', { precision: 11, scale: 8 }),
  locationString: varchar('location_string', { length: 255 }),
  isAvailable: integer('is_available').default(1), // 1 = available, 0 = unavailable
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Services table - Available services with pricing
export const services = pgTable('services', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  duration: integer('duration').notNull(), // Duration in minutes
  basePrice: decimal('base_price', { precision: 10, scale: 2 }).notNull(),
  categoryId: integer('category_id')
    .references(() => categories.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Bookings table - Service bookings
export const bookings = pgTable('bookings', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => services.id, { onDelete: 'cascade' }),
  bookingDate: timestamp('booking_date').notNull(),
  startTime: varchar('start_time', { length: 10 }).notNull(), // e.g., "09:00 AM"
  endTime: varchar('end_time', { length: 10 }).notNull(),
  totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes'),
  status: varchar('status', { length: 20 }).default('pending'), // pending, confirmed, completed, cancelled
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Time Slots table - Available time slots for providers
export const timeSlots = pgTable('time_slots', {
  id: uuid('id').defaultRandom().primaryKey(),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  date: timestamp('date').notNull(),
  time: varchar('time', { length: 10 }).notNull(), // e.g., "09:00 AM"
  isAvailable: integer('is_available').default(1), // 1 = available, 0 = booked
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Define relationships
export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
  providerProfile: many(providerProfiles),
  customerBookings: many(bookings, { relationName: 'customerBookings' }),
  providerBookings: many(bookings, { relationName: 'providerBookings' }),
  timeSlots: many(timeSlots),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  providerProfiles: many(providerProfiles),
  services: many(services),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

export const providerProfilesRelations = relations(providerProfiles, ({ one }) => ({
  user: one(users, {
    fields: [providerProfiles.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [providerProfiles.categoryId],
    references: [categories.id],
  }),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  category: one(categories, {
    fields: [services.categoryId],
    references: [categories.id],
  }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  customer: one(users, {
    fields: [bookings.customerId],
    references: [users.id],
    relationName: 'customerBookings',
  }),
  provider: one(users, {
    fields: [bookings.providerId],
    references: [users.id],
    relationName: 'providerBookings',
  }),
  service: one(services, {
    fields: [bookings.serviceId],
    references: [services.id],
  }),
}));

export const timeSlotsRelations = relations(timeSlots, ({ one }) => ({
  provider: one(users, {
    fields: [timeSlots.providerId],
    references: [users.id],
  }),
}));

// Type exports for use in controllers
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;

export type ProviderProfile = typeof providerProfiles.$inferSelect;
export type NewProviderProfile = typeof providerProfiles.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type TimeSlot = typeof timeSlots.$inferSelect;
export type NewTimeSlot = typeof timeSlots.$inferInsert;

// Extended types for API responses
export type UserWithRoles = User & {
  roles: Role[];
};

export type ProviderProfileWithUser = ProviderProfile & {
  user: User;
  category?: Category;
};

export type BookingWithDetails = Booking & {
  customer: User;
  provider: User;
  service: Service;
};