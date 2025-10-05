import { Request, Response } from 'express';
import Joi from 'joi';
import { eq, desc, and, gte } from 'drizzle-orm';
import { db } from '../db/connectDB';
import { services, bookings, timeSlots, users, categories, NewService, NewBooking, NewTimeSlot } from '../db/schema';
import { formatError, formatSuccess } from '../utils/helpers';

// Validation schemas
const createServiceSchema = Joi.object({
  name: Joi.string().max(255).required().messages({
    'string.max': 'Service name cannot exceed 255 characters',
    'any.required': 'Service name is required'
  }),
  description: Joi.string().optional(),
  duration: Joi.number().integer().positive().required().messages({
    'number.positive': 'Duration must be a positive number',
    'any.required': 'Duration is required'
  }),
  basePrice: Joi.number().positive().precision(2).required().messages({
    'number.positive': 'Base price must be a positive number',
    'any.required': 'Base price is required'
  }),
  categoryId: Joi.number().integer().optional()
});

const createBookingSchema = Joi.object({
  providerId: Joi.string().uuid().required().messages({
    'string.uuid': 'Provider ID must be a valid UUID',
    'any.required': 'Provider ID is required'
  }),
  serviceId: Joi.string().uuid().required().messages({
    'string.uuid': 'Service ID must be a valid UUID',
    'any.required': 'Service ID is required'
  }),
  bookingDate: Joi.date().iso().min('now').required().messages({
    'date.min': 'Booking date cannot be in the past',
    'any.required': 'Booking date is required'
  }),
  startTime: Joi.string().pattern(/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/).required().messages({
    'string.pattern.base': 'Start time must be in format "HH:MM AM/PM"',
    'any.required': 'Start time is required'
  }),
  notes: Joi.string().max(1000).optional()
});

/**
 * Get all services
 * GET /api/services
 */
export const getServices = async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId } = req.query;

    let query = db
      .select({
        id: services.id,
        name: services.name,
        description: services.description,
        duration: services.duration,
        basePrice: services.basePrice,
        categoryId: services.categoryId,
        category: {
          id: categories.id,
          name: categories.name,
          icon: categories.icon,
          color: categories.color,
        },
        createdAt: services.createdAt,
      })
      .from(services)
      .leftJoin(categories, eq(services.categoryId, categories.id))
      .orderBy(services.name);

    if (categoryId) {
      query = query.where(eq(services.categoryId, parseInt(categoryId as string)));
    }

    const servicesList = await query;

    res.status(200).json(formatSuccess(servicesList, 'Services retrieved successfully'));

  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Get service by ID
 * GET /api/services/:id
 */
export const getService = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json(formatError('Service ID is required', 'INVALID_SERVICE_ID'));
      return;
    }

    const serviceResults = await db
      .select({
        id: services.id,
        name: services.name,
        description: services.description,
        duration: services.duration,
        basePrice: services.basePrice,
        categoryId: services.categoryId,
        category: {
          id: categories.id,
          name: categories.name,
          icon: categories.icon,
          color: categories.color,
        },
        createdAt: services.createdAt,
      })
      .from(services)
      .leftJoin(categories, eq(services.categoryId, categories.id))
      .where(eq(services.id, id));

    const service = serviceResults[0];

    if (!service) {
      res.status(404).json(formatError('Service not found', 'SERVICE_NOT_FOUND'));
      return;
    }

    res.status(200).json(formatSuccess(service, 'Service retrieved successfully'));

  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Create a new service (Admin only)
 * POST /api/services
 */
export const createService = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input
    const { error, value } = createServiceSchema.validate(req.body);
    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    const { name, description, duration, basePrice, categoryId } = value;

    // Create new service
    const newService: NewService = {
      name,
      description,
      duration,
      basePrice: basePrice.toString(),
      categoryId: categoryId || null,
    };

    const insertedServices = await db
      .insert(services)
      .values(newService)
      .returning();

    const insertedService = insertedServices[0];

    if (!insertedService) {
      res.status(500).json(formatError('Failed to create service', 'SERVICE_CREATION_FAILED'));
      return;
    }

    res.status(201).json(formatSuccess(insertedService, 'Service created successfully'));

  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Create a new booking
 * POST /api/bookings
 */
export const createBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    // Validate input
    const { error, value } = createBookingSchema.validate(req.body);
    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    const { providerId, serviceId, bookingDate, startTime, notes } = value;
    const customerId = req.user.userId;

    // Verify service exists
    const serviceResults = await db.select().from(services).where(eq(services.id, serviceId));
    const service = serviceResults[0];

    if (!service) {
      res.status(404).json(formatError('Service not found', 'SERVICE_NOT_FOUND'));
      return;
    }

    // Verify provider exists
    const providerResults = await db.select().from(users).where(eq(users.id, providerId));
    const provider = providerResults[0];

    if (!provider) {
      res.status(404).json(formatError('Provider not found', 'PROVIDER_NOT_FOUND'));
      return;
    }

    // Calculate end time based on service duration
    const startDate = new Date(bookingDate);
    const [time, period] = startTime.split(' ');
    const [hours, minutes] = time.split(':').map(Number);
    
    let hour24 = hours;
    if (period === 'PM' && hours !== 12) hour24 += 12;
    if (period === 'AM' && hours === 12) hour24 = 0;
    
    startDate.setHours(hour24, minutes, 0, 0);
    
    const endDate = new Date(startDate.getTime() + service.duration * 60000);
    const endTime = endDate.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });

    // Calculate total price (for now, just use base price)
    const totalPrice = service.basePrice;

    // Create new booking
    const newBooking: NewBooking = {
      customerId,
      providerId,
      serviceId,
      bookingDate: new Date(bookingDate),
      startTime,
      endTime,
      totalPrice: totalPrice.toString(),
      notes: notes || null,
      status: 'pending',
    };

    const insertedBookings = await db
      .insert(bookings)
      .values(newBooking)
      .returning();

    const insertedBooking = insertedBookings[0];

    if (!insertedBooking) {
      res.status(500).json(formatError('Failed to create booking', 'BOOKING_CREATION_FAILED'));
      return;
    }

    res.status(201).json(formatSuccess(insertedBooking, 'Booking created successfully'));

  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Get user's bookings
 * GET /api/bookings
 */
export const getUserBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
      return;
    }

    const userId = req.user.userId;

    const userBookings = await db
      .select({
        id: bookings.id,
        bookingDate: bookings.bookingDate,
        startTime: bookings.startTime,
        endTime: bookings.endTime,
        totalPrice: bookings.totalPrice,
        notes: bookings.notes,
        status: bookings.status,
        service: {
          id: services.id,
          name: services.name,
          duration: services.duration,
        },
        provider: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .leftJoin(services, eq(bookings.serviceId, services.id))
      .leftJoin(users, eq(bookings.providerId, users.id))
      .where(eq(bookings.customerId, userId))
      .orderBy(desc(bookings.bookingDate));

    res.status(200).json(formatSuccess(userBookings, 'Bookings retrieved successfully'));

  } catch (error) {
    console.error('Get user bookings error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Initialize default services
 * POST /api/services/init-defaults
 */
export const initializeDefaultServices = async (req: Request, res: Response): Promise<void> => {
  try {
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

    // Insert services, ignore if they already exist
    const insertedServices = await db
      .insert(services)
      .values(servicesToInsert)
      .onConflictDoNothing()
      .returning();

    res.status(201).json(formatSuccess({
      inserted: insertedServices.length,
      services: insertedServices
    }, 'Default services initialized successfully'));

  } catch (error) {
    console.error('Initialize default services error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};