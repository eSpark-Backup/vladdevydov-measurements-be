const express = require("express");
const path = require("path");
const fs = require("fs");
const pool = require("../config/database");
const {
  authenticateToken,
  requireAdmin,
  requireAdminOrOwner,
} = require("../middleware/auth");
const { upload, handleUploadError } = require("../middleware/upload");
const {
  validate,
  createProjectSchema,
  updateProjectSchema,
  addProjectDataSchema,
} = require("../middleware/validation");

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
router.post(
  "/",
  authenticateToken,
  validate(createProjectSchema),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { name, description, userIds = [] } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;

      await client.query("BEGIN");

      const projectResult = await client.query(
        "INSERT INTO projects (name, description, created_by) VALUES ($1, $2, $3) RETURNING *",
        [name, description || "", userId]
      );
      const project = projectResult.rows[0];

      await client.query(
        "INSERT INTO project_users (project_id, user_id, added_by) VALUES ($1, $2, $3)",
        [project.id, userId, userId]
      );

      if (userRole === "admin" && Array.isArray(userIds)) {
        for (const uid of userIds) {
          if (uid !== userId) {
            await client.query(
              "INSERT INTO project_users (project_id, user_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
              [project.id, uid, userId]
            );
          }
        }
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Project created successfully",
        project,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Create project error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while creating project",
      });
    } finally {
      client.release();
    }
  }
);

router.get("/", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
            SELECT p.*, u.email as creator_email 
            FROM projects p 
            JOIN users u ON p.created_by = u.id
        `;
    let countQuery = "SELECT COUNT(*) FROM projects p";
    const params = [];

    if (req.user.role !== "admin") {
      query += " WHERE p.created_by = $1";
      countQuery += " WHERE p.created_by = $1";
      params.push(req.user.id);
    }

    query +=
      " ORDER BY p.created_at DESC LIMIT $" +
      (params.length + 1) +
      " OFFSET $" +
      (params.length + 2);
    params.push(limit, offset);

    const [projectsResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, req.user.role === "admin" ? [] : [req.user.id]),
    ]);

    const total = parseInt(countResult.rows[0].count);
    const pages = Math.ceil(total / limit);

    for (let project of projectsResult.rows) {
      const assignedUsersResult = await pool.query(
        `SELECT u.id, u.email
     FROM project_users pu
     JOIN users u ON pu.user_id = u.id
     WHERE pu.project_id = $1`,
        [project.id]
      );
      project.assigned_users = assignedUsersResult.rows;
    }

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
    console.error("Get projects error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching projects",
    });
  }
});

router.get("/:id", authenticateToken, requireAdminOrOwner, async (req, res) => {
  try {
    const { id } = req.params;

    const projectResult = await pool.query(
      "SELECT p.*, u.email as creator_email FROM projects p JOIN users u ON p.created_by = u.id WHERE p.id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const assignedUsersResult = await pool.query(
      `SELECT u.id, u.email 
       FROM project_users pu
       JOIN users u ON pu.user_id = u.id
       WHERE pu.project_id = $1`,
      [id]
    );

    const filesResult = await pool.query(
      "SELECT id, filename, original_name, file_type, file_size, uploaded_at FROM project_files WHERE project_id = $1 ORDER BY uploaded_at DESC",
      [id]
    );

    const dataResult = await pool.query(
      "SELECT id, data_key, data_value, created_at FROM project_data WHERE project_id = $1 ORDER BY created_at DESC",
      [id]
    );

    const project = {
      ...projectResult.rows[0],
      files: filesResult.rows,
      data: dataResult.rows,
      assigned_users: assignedUsersResult.rows, // ✅ includes assigned users
    };

    res.json({
      success: true,
      project,
    });
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching project",
    });
  }
});


router.put(
  "/:id",
  authenticateToken,
  requireAdminOrOwner,
  validate(updateProjectSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const updateFields = [];
      const values = [];
      let paramCount = 0;

      Object.keys(updates).forEach((key) => {
        paramCount++;
        updateFields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
      });

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No fields to update",
        });
      }

      paramCount++;
      values.push(id);

      const query = `
            UPDATE projects 
            SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $${paramCount} 
            RETURNING *
        `;

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Project not found",
        });
      }

      res.json({
        success: true,
        message: "Project updated successfully",
        project: result.rows[0],
      });
    } catch (error) {
      console.error("Update project error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while updating project",
      });
    }
  }
);

router.post(
  "/:id/files",
  authenticateToken,
  requireAdminOrOwner,
  upload.array("files", 5),
  handleUploadError,
  async (req, res) => {
    try {
      const { id } = req.params;
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No files uploaded",
        });
      }

      const fileRecords = [];
      for (const file of files) {
        const result = await pool.query(
          "INSERT INTO project_files (project_id, filename, original_name, file_type, file_path, file_size) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
          [
            id,
            file.filename,
            file.originalname,
            file.mimetype,
            file.path,
            file.size,
          ]
        );
        fileRecords.push(result.rows[0]);
      }

      res.status(201).json({
        success: true,
        message: "Files uploaded successfully",
        files: fileRecords,
      });
    } catch (error) {
      console.error("Upload files error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while uploading files",
      });
    }
  }
);

router.post(
  "/:id/data",
  authenticateToken,
  requireAdminOrOwner,
  validate(addProjectDataSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { data_key, data_value } = req.body;

      const result = await pool.query(
        "INSERT INTO project_data (project_id, data_key, data_value) VALUES ($1, $2, $3) RETURNING *",
        [id, data_key, JSON.stringify(data_value)]
      );

      res.status(201).json({
        success: true,
        message: "Data added successfully",
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Add project data error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while adding project data",
      });
    }
  }
);

router.get(
  "/:projectId/files/:fileId/download",
  authenticateToken,
  requireAdminOrOwner,
  async (req, res) => {
    try {
      const { projectId, fileId } = req.params;

      const fileResult = await pool.query(
        "SELECT * FROM project_files WHERE id = $1 AND project_id = $2",
        [fileId, projectId]
      );

      if (fileResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "File not found",
        });
      }

      const file = fileResult.rows[0];

      if (!fs.existsSync(file.file_path)) {
        return res.status(404).json({
          success: false,
          message: "File not found on disk",
        });
      }

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${file.original_name}"`
      );
      res.setHeader("Content-Type", file.file_type);

      res.sendFile(path.resolve(file.file_path));
    } catch (error) {
      console.error("Download file error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while downloading file",
      });
    }
  }
);

router.delete(
  "/:id/files/:fileId",
  authenticateToken,
  requireAdminOrOwner,
  async (req, res) => {
    try {
      const { id, fileId } = req.params;

      const fileResult = await pool.query(
        "SELECT * FROM project_files WHERE id = $1 AND project_id = $2",
        [fileId, id]
      );

      if (fileResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "File not found",
        });
      }

      const file = fileResult.rows[0];

      await pool.query("DELETE FROM project_files WHERE id = $1", [fileId]);

      if (fs.existsSync(file.file_path)) {
        fs.unlinkSync(file.file_path);
      }

      res.json({
        success: true,
        message: "File deleted successfully",
      });
    } catch (error) {
      console.error("Delete file error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while deleting file",
      });
    }
  }
);

router.delete(
  "/:id",
  authenticateToken,
  requireAdminOrOwner,
  async (req, res) => {
    try {
      const { id } = req.params;

      const filesResult = await pool.query(
        "SELECT file_path FROM project_files WHERE project_id = $1",
        [id]
      );

      const deleteResult = await pool.query(
        "DELETE FROM projects WHERE id = $1 RETURNING *",
        [id]
      );

      if (deleteResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Project not found",
        });
      }

      filesResult.rows.forEach((file) => {
        if (fs.existsSync(file.file_path)) {
          fs.unlinkSync(file.file_path);
        }
      });

      const projectDir = path.join(__dirname, "../uploads", `project_${id}`);
      if (fs.existsSync(projectDir)) {
        try {
          fs.rmdirSync(projectDir);
        } catch {
        }
      }

      res.json({
        success: true,
        message: "Project deleted successfully",
      });
    } catch (error) {
      console.error("Delete project error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while deleting project",
      });
    }
  }
);

module.exports = router;
