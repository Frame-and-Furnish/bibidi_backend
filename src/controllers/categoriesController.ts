import { Request, Response } from 'express';
import Joi from 'joi';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/connectDB';
import { categories, NewCategory } from '../db/schema';
import { formatError, formatSuccess } from '../utils/helpers';

// Validation schema for category creation
const createCategorySchema = Joi.object({
  name: Joi.string().max(100).required().messages({
    'string.max': 'Category name cannot exceed 100 characters',
    'any.required': 'Category name is required'
  }),
  icon: Joi.string().max(10).required().messages({
    'string.max': 'Icon cannot exceed 10 characters',
    'any.required': 'Icon is required'
  }),
  color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).required().messages({
    'string.pattern.base': 'Color must be a valid hex color code (e.g., #FF5722)',
    'any.required': 'Color is required'
  })
});

/**
 * Get all categories
 * GET /api/categories
 */
export const getCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const categoriesList = await db
      .select()
      .from(categories)
      .orderBy(categories.name);

    res.status(200).json(formatSuccess(categoriesList, 'Categories retrieved successfully'));

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Get category by ID
 * GET /api/categories/:id
 */
export const getCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      res.status(400).json(formatError('Invalid category ID', 'INVALID_CATEGORY_ID'));
      return;
    }

    const categoryResults = await db
      .select()
      .from(categories)
      .where(eq(categories.id, parseInt(id)));

    const category = categoryResults[0];

    if (!category) {
      res.status(404).json(formatError('Category not found', 'CATEGORY_NOT_FOUND'));
      return;
    }

    res.status(200).json(formatSuccess(category, 'Category retrieved successfully'));

  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Create a new category (Admin only)
 * POST /api/categories
 */
export const createCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input
    const { error, value } = createCategorySchema.validate(req.body);
    if (error) {
      res.status(400).json(formatError(error.details[0]?.message || 'Validation failed', 'VALIDATION_ERROR'));
      return;
    }

    const { name, icon, color } = value;

    // Check if category already exists
    const existingCategory = await db
      .select()
      .from(categories)
      .where(eq(categories.name, name));

    if (existingCategory.length > 0) {
      res.status(409).json(formatError('Category with this name already exists', 'CATEGORY_EXISTS'));
      return;
    }

    // Create new category
    const newCategory: NewCategory = {
      name,
      icon,
      color,
    };

    const insertedCategories = await db
      .insert(categories)
      .values(newCategory)
      .returning();

    const insertedCategory = insertedCategories[0];

    if (!insertedCategory) {
      res.status(500).json(formatError('Failed to create category', 'CATEGORY_CREATION_FAILED'));
      return;
    }

    res.status(201).json(formatSuccess(insertedCategory, 'Category created successfully'));

  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};

/**
 * Initialize default categories
 * POST /api/categories/init-defaults
 */
export const initializeDefaultCategories = async (req: Request, res: Response): Promise<void> => {
  try {
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

    // Insert categories, ignore if they already exist
    const insertedCategories = await db
      .insert(categories)
      .values(defaultCategories)
      .onConflictDoNothing()
      .returning();

    res.status(201).json(formatSuccess({
      inserted: insertedCategories.length,
      categories: insertedCategories
    }, 'Default categories initialized successfully'));

  } catch (error) {
    console.error('Initialize default categories error:', error);
    res.status(500).json(formatError('Internal server error', 'INTERNAL_ERROR'));
  }
};