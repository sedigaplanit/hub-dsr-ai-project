const path = require('path')

/** @type {import('jest').Config} */
module.exports = {
  rootDir: __dirname,
  roots: ['<rootDir>/apps/web/src'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: path.resolve(__dirname, 'apps/web/tsconfig.test.json')
      }
    ]
  },
  moduleNameMapper: {
    '^@shared(.*)$': '<rootDir>/packages/shared/src$1',
    '\\.(css)$': '<rootDir>/jest/styleMock.js',
    '\\.(gif|ttf|eot|svg|png|jpg|jpeg)$': '<rootDir>/jest/fileMock.js'
  },
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: [],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
}
