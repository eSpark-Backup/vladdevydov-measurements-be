# Project Management Backend

A comprehensive Node.js backend system for project management with role-based access control, file uploads, and complete CRUD operations.

## Features

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (Admin & Employee)
- Secure password hashing with bcrypt
- Account activation/deactivation

### Admin Capabilities
- Create and manage employee accounts
- View all projects from all users
- Download files from any project
- Activate/deactivate employee accounts
- Full CRUD operations on users and projects

### Employee Capabilities
- Login with secure authentication
- Create and manage their own projects
- Upload files (JSON, PDF, Images) to projects
- Add JSON data to projects
- View and download files from their own projects only

### File Management
- Support for multiple file types: JSON, PDF, Images (JPG, PNG, GIF, WebP), TXT, DOC, DOCX
- File size limit: 10MB per file
- Maximum 5 files per upload
- Secure file storage with organized directory structure

### API Documentation
- Complete Swagger/OpenAPI documentation
- Interactive API testing interface
- Comprehensive endpoint documentation

## Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT (JSON Web Tokens)
- **File Upload**: Multer
- **Validation**: Joi
- **Documentation**: Swagger/OpenAPI
- **Containerization**: Docker & Docker Compose
- **Security**: Helmet, CORS, Rate Limiting

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)

### Using Docker (Recommended)

1. Clone the repository
```bash
git clone <repository-url>
cd project-management-backend
```

2. Create environment file
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start the application
```bash
docker-compose up -d
```

4. Access the application
- API: http://localhost:3000
- Documentation: http://localhost:3000/api-docs
- Health Check: http://localhost:3000/health

### Local Development

1. Install dependencies
```bash
npm install
```

2. Set up PostgreSQL database
```bash
# Create database and run init.sql
```

3. Configure environment
```bash
cp .env.example .env
# Update database connection details
```

4. Start development server
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Verify JWT token

### Users (Admin only)
- `POST /api/users` - Create user
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `PUT /api/users/:id/deactivate` - Deactivate user
- `PUT /api/users/:id/activate` - Activate user

### Projects
- `POST /api/projects` - Create project
- `GET /api/projects` - Get projects (filtered by role)
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Project Files
- `POST /api/projects/:id/files` - Upload files
- `GET /api/projects/:projectId/files/:fileId/download` - Download file
- `DELETE /api/projects/:id/files/:fileId` - Delete file

### Project Data
- `POST /api/projects/:id/data` - Add JSON data

## Default Admin Account

The system comes with a default admin account:
- **Email**: admin@example.com
- **Password**: admin123

⚠️ **Important**: Change this password in production!

## Database Schema

### Users Table
- `id` (Primary Key)
- `email` (Unique)
- `password` (Hashed)
- `role` (admin/employee)
- `is_active` (Boolean)
- `created_at`, `updated_at`

### Projects Table
- `id` (Primary Key)
- `name`
- `description`
- `created_by` (Foreign Key to users)
- `created_at`, `updated_at`

### Project Files Table
- `id` (Primary Key)
- `project_id` (Foreign Key)
- `filename`, `original_name`
- `file_type`, `file_path`, `file_size`
- `uploaded_at`

### Project Data Table
- `id` (Primary Key)
- `project_id` (Foreign Key)
- `data_key`
- `data_value` (JSONB)
- `created_at`

## Security Features

- JWT token authentication
- Password hashing with bcrypt
- Rate limiting (100 requests per 15 minutes)
- CORS protection
- Helmet security headers
- Input validation with Joi
- File type restrictions
- File size limitations
- SQL injection prevention with parameterized queries

## File Upload Security

- Restricted file types (no executable files)
- File size limits (10MB max)
- Organized storage in project-specific directories
- Original filename preservation
- MIME type validation

## Error Handling

- Comprehensive error responses
- Proper HTTP status codes
- Detailed validation error messages
- Development/production error modes

## API Response Format

All API responses follow a consistent format:

```json
{
  "success": true/false,
  "message": "Description of the result",
  "data": { ... },  // Present on successful operations
  "error": "Error details"  // Present on errors (dev mode only)
}
```

## Development

### Running Tests
```bash
npm test
```

### Code Structure
```
├── config/
│   └── database.js         # Database configuration
├── middleware/
│   ├── auth.js            # Authentication middleware
│   ├── upload.js          # File upload middleware
│   └── validation.js      # Input validation schemas
├── routes/
│   ├── auth.js           # Authentication routes
│   ├── users.js          # User management routes
│   └── projects.js       # Project management routes
├── uploads/              # File storage directory
├── server.js            # Main application file
├── package.json
├── Dockerfile
├── docker-compose.yml
└── init.sql            # Database initialization
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment mode | development |
| `JWT_SECRET` | JWT signing secret | (required) |
| `DB_HOST` | Database host | localhost |
| `DB_PORT` | Database port | 5432 |
| `DB_NAME` | Database name | projectdb |
| `DB_USER` | Database user | postgres |
| `DB_PASSWORD` | Database password | (required) |

## Production Deployment

1. Update environment variables for production
2. Change default admin password
3. Set strong JWT secret
4. Configure proper database credentials
5. Set up SSL/TLS termination
6. Configure backup strategy
7. Set up monitoring and logging

## Support

For questions or issues, please refer to the API documentation at `/api-docs` or check the health endpoint at `/health`.

## License

MIT License