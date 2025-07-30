const express = require('express');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');
const { authenticateToken, requireAdmin, requireAdminOrOwner } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const { validate, createProjectSchema, updateProjectSchema, addProjectDataSchema } = require('../middleware/validation');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Project:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         created_by:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         creator_email:
 *           type: string
 *     CreateProjectRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           maxLength: 255
 *         description:
 *           type: string
 *           maxLength: 1000
 */

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProjectRequest'
 *     responses:
 *       201:
 *         description: Project created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 */
router.post('/', authenticateToken, validate(createProjectSchema), async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user.id;

        const result = await pool.query(
            'INSERT INTO projects (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
            [name, description || '', userId]
        );

        const project = result.rows[0];

        res.status(201).json({
            success: true,
            message: 'Project created successfully',
            project,
        });
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating project',
        });
    }
});

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get projects (Admin sees all, employees see only their own)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of projects
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 projects:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Project'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
      SELECT p.*, u.email as creator_email 
      FROM projects p 
      JOIN users u ON p.created_by = u.id
    `;
        let countQuery = 'SELECT COUNT(*) FROM projects p';
        const params = [];

        // If not admin, only show user's own projects
        if (req.user.role !== 'admin') {
            query += ' WHERE p.created_by = $1';
            countQuery += ' WHERE p.created_by = $1';
            params.push(req.user.id);
        }

        query += ' ORDER BY p.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(limit, offset);

        const [projectsResult, countResult] = await Promise.all([
            pool.query(query, params),
            pool.query(countQuery, req.user.role === 'admin' ? [] : [req.user.id])
        ]);

        const total = parseInt(countResult.rows[0].count);
        const pages = Math.ceil(total / limit);

        res.json({
            success: true,
            projects: projectsResult.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages,
            },
        });
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching projects',
        });
    }
});

/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     summary: Get project by ID
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project details with files and data
 *       404:
 *         description: Project not found
 *       403:
 *         description: Access denied
 */
router.get('/:id', authenticateToken, requireAdminOrOwner, async (req, res) => {
    try {
        const { id } = req.params;

        // Get project details
        const projectResult = await pool.query(
            'SELECT p.*, u.email as creator_email FROM projects p JOIN users u ON p.created_by = u.id WHERE p.id = $1',
            [id]
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found',
            });
        }

        // Get project files
        const filesResult = await pool.query(
            'SELECT id, filename, original_name, file_type, file_size, uploaded_at FROM project_files WHERE project_id = $1 ORDER BY uploaded_at DESC',
            [id]
        );

        // Get project data
        const dataResult = await pool.query(
            'SELECT id, data_key, data_value, created_at FROM project_data WHERE project_id = $1 ORDER BY created_at DESC',
            [id]
        );

        const project = {
            ...projectResult.rows[0],
            files: filesResult.rows,
            data: dataResult.rows,
        };

        res.json({
            success: true,
            project,
        });
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching project',
        });
    }
});

/**
 * @swagger
 * /api/projects/{id}:
 *   put:
 *     summary: Update project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Project updated successfully
 *       404:
 *         description: Project not found
 *       403:
 *         description: Access denied
 */
router.put('/:id', authenticateToken, requireAdminOrOwner, validate(updateProjectSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Build dynamic update query
        const updateFields = [];
        const values = [];
        let paramCount = 0;

        Object.keys(updates).forEach(key => {
            paramCount++;
            updateFields.push(`${key} = $${paramCount}`);
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
      UPDATE projects 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $${paramCount} 
      RETURNING *
    `;

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found',
            });
        }

        res.json({
            success: true,
            message: 'Project updated successfully',
            project: result.rows[0],
        });
    } catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating project',
        });
    }
});

/**
 * @swagger
 * /api/projects/{id}/files:
 *   post:
 *     summary: Upload files to project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Files uploaded successfully
 *       400:
 *         description: Upload error
 *       404:
 *         description: Project not found
 *       403:
 *         description: Access denied
 */
router.post('/:id/files', authenticateToken, requireAdminOrOwner, upload.array('files', 5), handleUploadError, async (req, res) => {
    try {
        const { id } = req.params;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded',
            });
        }

        // Insert file records into database
        const fileRecords = [];
        for (const file of files) {
            const result = await pool.query(
                'INSERT INTO project_files (project_id, filename, original_name, file_type, file_path, file_size) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                [id, file.filename, file.originalname, file.mimetype, file.path, file.size]
            );
            fileRecords.push(result.rows[0]);
        }

        res.status(201).json({
            success: true,
            message: 'Files uploaded successfully',
            files: fileRecords,
        });
    } catch (error) {
        console.error('Upload files error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while uploading files',
        });
    }
});

/**
 * @swagger
 * /api/projects/{id}/data:
 *   post:
 *     summary: Add JSON data to project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data_key
 *               - data_value
 *             properties:
 *               data_key:
 *                 type: string
 *                 maxLength: 255
 *               data_value:
 *                 type: object
 *     responses:
 *       201:
 *         description: Data added successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Project not found
 *       403:
 *         description: Access denied
 */
router.post('/:id/data', authenticateToken, requireAdminOrOwner, validate(addProjectDataSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { data_key, data_value } = req.body;

        const result = await pool.query(
            'INSERT INTO project_data (project_id, data_key, data_value) VALUES ($1, $2, $3) RETURNING *',
            [id, data_key, JSON.stringify(data_value)]
        );

        res.status(201).json({
            success: true,
            message: 'Data added successfully',
            data: result.rows[0],
        });
    } catch (error) {
        console.error('Add project data error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while adding project data',
        });
    }
});

/**
 * @swagger
 * /api/projects/{projectId}/files/{fileId}/download:
 *   get:
 *     summary: Download project file
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: integer
 *         description: File ID
 *     responses:
 *       200:
 *         description: File download
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: File not found
 *       403:
 *         description: Access denied
 */
router.get('/:projectId/files/:fileId/download', authenticateToken, requireAdminOrOwner, async (req, res) => {
    try {
        const { projectId, fileId } = req.params;

        // Get file details
        const fileResult = await pool.query(
            'SELECT * FROM project_files WHERE id = $1 AND project_id = $2',
            [fileId, projectId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'File not found',
            });
        }

        const file = fileResult.rows[0];

        // Check if file exists on disk
        if (!fs.existsSync(file.file_path)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on disk',
            });
        }

        // Set appropriate headers
        res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
        res.setHeader('Content-Type', file.file_type);

        // Send file
        res.sendFile(path.resolve(file.file_path));
    } catch (error) {
        console.error('Download file error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while downloading file',
        });
    }
});

/**
 * @swagger
 * /api/projects/{id}/files/{fileId}:
 *   delete:
 *     summary: Delete project file
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: integer
 *         description: File ID
 *     responses:
 *       200:
 *         description: File deleted successfully
 *       404:
 *         description: File not found
 *       403:
 *         description: Access denied
 */
router.delete('/:id/files/:fileId', authenticateToken, requireAdminOrOwner, async (req, res) => {
    try {
        const { id, fileId } = req.params;

        // Get file details before deletion
        const fileResult = await pool.query(
            'SELECT * FROM project_files WHERE id = $1 AND project_id = $2',
            [fileId, id]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'File not found',
            });
        }

        const file = fileResult.rows[0];

        // Delete file from database
        await pool.query('DELETE FROM project_files WHERE id = $1', [fileId]);

        // Delete file from disk
        if (fs.existsSync(file.file_path)) {
            fs.unlinkSync(file.file_path);
        }

        res.json({
            success: true,
            message: 'File deleted successfully',
        });
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting file',
        });
    }
});

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     summary: Delete project (Admin or owner only)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *       404:
 *         description: Project not found
 *       403:
 *         description: Access denied
 */
router.delete('/:id', authenticateToken, requireAdminOrOwner, async (req, res) => {
    try {
        const { id } = req.params;

        // Get all files for cleanup
        const filesResult = await pool.query(
            'SELECT file_path FROM project_files WHERE project_id = $1',
            [id]
        );

        // Delete project (cascade will handle related records)
        const deleteResult = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING *', [id]);

        if (deleteResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found',
            });
        }

        // Clean up files from disk
        filesResult.rows.forEach(file => {
            if (fs.existsSync(file.file_path)) {
                fs.unlinkSync(file.file_path);
            }
        });

        // Try to remove project directory if empty
        const projectDir = path.join(__dirname, '../uploads', `project_${id}`);
        if (fs.existsSync(projectDir)) {
            try {
                fs.rmdirSync(projectDir);
            } catch (error) {
                // Directory not empty or other error, ignore
            }
        }

        res.json({
            success: true,
            message: 'Project deleted successfully',
        });
    } catch (error) {
        console.error('Delete project error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting project',
        });
    }
});

module.exports = router;