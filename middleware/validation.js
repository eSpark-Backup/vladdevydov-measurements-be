const Joi = require('joi');

// User validation schemas
const registerSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('admin', 'employee').default('employee')
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

const updateUserSchema = Joi.object({
    email: Joi.string().email(),
    is_active: Joi.boolean()
}).min(1);

// Project validation schemas
const createProjectSchema = Joi.object({
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(1000).allow('')
});

const updateProjectSchema = Joi.object({
    name: Joi.string().min(1).max(255),
    description: Joi.string().max(1000).allow('')
}).min(1);

const addProjectDataSchema = Joi.object({
    data_key: Joi.string().min(1).max(255).required(),
    data_value: Joi.object().required()
});

// Validation middleware factory
const validate = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body);

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                details: error.details.map(detail => detail.message)
            });
        }

        req.body = value;
        next();
    };
};

module.exports = {
    validate,
    registerSchema,
    loginSchema,
    updateUserSchema,
    createProjectSchema,
    updateProjectSchema,
    addProjectDataSchema,
};