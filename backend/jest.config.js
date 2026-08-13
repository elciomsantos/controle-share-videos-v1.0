/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testEnvironment: "node",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "tsconfig.spec.json" }],
  },
  moduleNameMapper: { "^file-type$": "<rootDir>/test/stubs/file-type.ts" },
  transformIgnorePatterns: ["node_modules/(?!(?:@scure|@noble|@otplib)/)"],
  collectCoverageFrom: [
    "src/config/config.service.ts",
    "src/auth/guard/jwt.guard.ts",
    "src/share/dto/share.dto.ts",
    "src/share/share.service.ts",
    "src/share/share.mapper.ts",
    "src/share/file-storage.service.ts",
    "src/share/share-archive.service.ts",
    "src/share/domain/share-validation.service.ts",
    "src/share/domain/share-token.service.ts",
    "src/share/domain/share-limit.service.ts",
  ],
  coverageDirectory: "./coverage",
  coverageThreshold: {
    global: {
      lines: 60,
      functions: 60,
      branches: 50,
      statements: 60,
    },
  },
  setupFiles: ["<rootDir>/test/setup-unit.ts"],
  maxWorkers: 2,
};
