const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required',
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if user still exists and is active
        const userResult = await pool.query(
            'SELECT id, email, role, is_active FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'User not found',
            });
        }

        const user = userResult.rows[0];

        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Account has been deactivated',
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({
            success: false,
            message: 'Invalid or expired token',
        });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Admin access required',
        });
    }
    next();
};

const requireAdminOrOwner = async (req, res, next) => {
    if (req.user.role === 'admin') {
        return next();
    }

    // For project-related routes, check if user owns the project
    const projectId = req.params.id || req.params.projectId;
    if (projectId) {
        try {
            const result = await pool.query(
                'SELECT created_by FROM projects WHERE id = $1',
                [projectId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Project not found',
                });
            }

            if (result.rows[0].created_by !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. You can only access your own projects.',
                });
            }
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Error checking project ownership',
            });
        }
    }

    next();
};

module.exports = {
    authenticateToken,
    requireAdmin,
    requireAdminOrOwner,
};