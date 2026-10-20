module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^react$": require.resolve("react", { paths: [__dirname] }),
    "^react/jsx-runtime$": require.resolve("react/jsx-runtime", { paths: [__dirname] }),
    "^react/jsx-dev-runtime$": require.resolve("react/jsx-dev-runtime", { paths: [__dirname] }),
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  clearMocks: true,
};
