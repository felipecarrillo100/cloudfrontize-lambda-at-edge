module.exports = {
    // The root directory that Jest should scan for tests and modules within
    rootDir: './',

    // Ensure Jest doesn't try to run the generated Lambda files as tests
    testPathIgnorePatterns: [
        '/node_modules/',
        '/tests_fixtures/',
        '/dist/'
    ],

    // Automatically clear mock calls and instances between every test
    clearMocks: true,

    // The test environment that will be used for testing
    testEnvironment: 'node',

    // Indicates whether each individual test should be reported during the run
    verbose: true,

    // Force Jest to exit after all tests are complete
    // (helps with dangling timers in our 'zombie' fidelity tests)
    forceExit: true,

    // Detect open handles to help debug async leaks in the EdgeRunner
    detectOpenHandles: true
};
