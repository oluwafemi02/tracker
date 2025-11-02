/**
 * Jest Configuration for Expense Tracker Unit Tests
 */

module.exports = {
  testEnvironment: 'jsdom',
  testMatch: [
    '**/tests/unit/**/*.test.js'
  ],
  collectCoverageFrom: [
    'index.html',
    '!**/node_modules/**',
    '!**/vendor/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleFileExtensions: ['js', 'json'],
  verbose: true,
  testTimeout: 10000
};
