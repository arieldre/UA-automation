module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/__tests__/setup.js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['server.js', 'db.js', 'api/*.js'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  testTimeout: 10000,
};
