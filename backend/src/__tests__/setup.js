'use strict';

/**
 * Test environment setup.
 * Sets required env vars before any test module is imported.
 */
process.env.TZ = 'Asia/Kolkata';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_only_for_unit_tests_do_not_use_in_production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_SALT_ROUNDS = '4'; // Low rounds for fast tests
process.env.FRONTEND_URL = 'http://localhost:5173';

// Database — tests use a separate test database or mocks
process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
process.env.DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'ergo_employee_test_db';
process.env.DB_USER = process.env.TEST_DB_USER || 'postgres';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'postgres';
