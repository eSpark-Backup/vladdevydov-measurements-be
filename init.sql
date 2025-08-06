-- Create users table
CREATE TABLE IF NOT EXISTS users
(
    id         SERIAL PRIMARY KEY,
    email      VARCHAR(255) UNIQUE NOT NULL,
    password   VARCHAR(255)        NOT NULL,
    role       VARCHAR(20)         NOT NULL DEFAULT 'employee',
    is_active  BOOLEAN                      DEFAULT true,
    created_at TIMESTAMP                    DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP                    DEFAULT CURRENT_TIMESTAMP
);

-- Create projects table
CREATE TABLE IF NOT EXISTS projects
(
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    created_by  INTEGER REFERENCES users (id),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 👇 New table to manage project-user relationships
CREATE TABLE IF NOT EXISTS project_users
(
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER REFERENCES projects (id) ON DELETE CASCADE,
    user_id     INTEGER REFERENCES users (id) ON DELETE CASCADE,
    added_by    INTEGER REFERENCES users (id), -- who added this user
    added_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id) -- avoid duplicates
);

-- Create project_files table
CREATE TABLE IF NOT EXISTS project_files
(
    id            SERIAL PRIMARY KEY,
    project_id    INTEGER REFERENCES projects (id) ON DELETE CASCADE,
    filename      VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_type     VARCHAR(100) NOT NULL,
    file_path     VARCHAR(500) NOT NULL,
    file_size     INTEGER,
    uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create project_data table for JSON data
CREATE TABLE IF NOT EXISTS project_data
(
    id         SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects (id) ON DELETE CASCADE,
    data_key   VARCHAR(255) NOT NULL,
    data_value JSONB        NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin user (password: admin123)
INSERT INTO users (email, password, role)
VALUES ('admin@example.com', '$2a$10$8K1p/a0dRczANrwGQ4Yq/OQJ9Z2LxQwL8ePk.Qh9VWzr5rJC1XMEO', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects (created_by);
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files (project_id);
CREATE INDEX IF NOT EXISTS idx_project_data_project_id ON project_data (project_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users (is_active);
CREATE INDEX IF NOT EXISTS idx_project_users_project_id ON project_users (project_id);
CREATE INDEX IF NOT EXISTS idx_project_users_user_id ON project_users (user_id);
