/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testEnvironment: "node",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "tsconfig.spec.json" }],
  },
  collectCoverageFrom: [
    "src/config/config.service.ts",
    "src/auth/guard/jwt.guard.ts",
    "src/share/dto/share.dto.ts",
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
