const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validate, registerSchema, updateUserSchema } = require('../middleware/validation');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         email:
 *           type: string
 *         role:
 *           type: string
 *         is_active:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *     CreateUserRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           minLength: 6
 *         role:
 *           type: string
 *           enum: [admin, employee]
 *           default: employee
 */

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create a new user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error or user already exists
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post('/', authenticateToken, requireAdmin, validate(registerSchema), async (req, res) => {
    try {
        const { email, password, role } = req.body;

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists',
            });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const result = await pool.query(
            'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id, email, role, is_active, created_at',
            [email, hashedPassword, role]
        );

        const newUser = result.rows[0];

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: newUser,
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating user',
        });
    }
});

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, employee]
 *         description: Filter by user role
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       403:
 *         description: Admin access required
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { role, is_active } = req.query;

        let query = 'SELECT id, email, role, is_active, created_at, updated_at FROM users WHERE 1=1';
        const params = [];
        let paramCount = 0;

        if (role) {
            paramCount++;
            query += ` AND role = ${paramCount}`;
            params.push(role);
        }

        if (is_active !== undefined) {
            paramCount++;
            query += ` AND is_active = ${paramCount}`;
            params.push(is_active === 'true');
        }

        query += ' ORDER BY created_at DESC';

        const result = await pool.query(query, params);

        res.json({
            success: true,
            users: result.rows,
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching users',
        });
    }
});

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
 *       404:
 *         description: User not found
 *       403:
 *         description: Admin access required
 */
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'SELECT id, email, role, is_active, created_at, updated_at FROM users WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.json({
            success: true,
            user: result.rows[0],
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user',
        });
    }
});

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 *       403:
 *         description: Admin access required
 */
router.put('/:id', authenticateToken, requireAdmin, validate(updateUserSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Check if user exists
        const userExists = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
        if (userExists.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        // Build dynamic update query
        const updateFields = [];
        const values = [];
        let paramCount = 0;

        Object.keys(updates).forEach(key => {
            paramCount++;
            updateFields.push(`${key} = ${paramCount}`);
            values.push(updates[key]);
        });

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update',
            });
        }

        paramCount++;
        values.push(id);

        const query = `
      UPDATE users 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ${paramCount} 
      RETURNING id, email, role, is_active, updated_at
    `;

        const result = await pool.query(query, values);

        res.json({
            success: true,
            message: 'User updated successfully',
            user: result.rows[0],
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating user',
        });
    }
});

/**
 * @swagger
 * /api/users/{id}/deactivate:
 *   put:
 *     summary: Deactivate user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deactivated successfully
 *       404:
 *         description: User not found
 *       403:
 *         description: Admin access required
 */
router.put('/:id/deactivate', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, email, is_active',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.json({
            success: true,
            message: 'User deactivated successfully',
            user: result.rows[0],
        });
    } catch (error) {
        console.error('Deactivate user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deactivating user',
        });
    }
});

/**
 * @swagger
 * /api/users/{id}/activate:
 *   put:
 *     summary: Activate user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User activated successfully
 *       404:
 *         description: User not found
 *       403:
 *         description: Admin access required
 */
router.put('/:id/activate', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'UPDATE users SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, email, is_active',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.json({
            success: true,
            message: 'User activated successfully',
            user: result.rows[0],
        });
    } catch (error) {
        console.error('Activate user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while activating user',
        });
    }
});

module.exports = router;