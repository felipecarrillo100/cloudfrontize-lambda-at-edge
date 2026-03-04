'use strict';

/**
 * AWS Lambda@Edge Strict Limits
 */
const AWS_LIMITS = {
    VIEWER_REQUEST_BODY_BYTES: 40 * 1024,      // 40KB
    GENERATED_RESPONSE_BODY_BYTES: 1024 * 1024, // 1MB
    COMPRESSION_BYPASS_BYTES: 10 * 1024 * 1024, // 10MB
    EXECUTION_TIMEOUT_MS: 3000                  // 3 seconds
};

/**
 * AWS Forbidden & Read-only Headers
 */
const AWS_HEADERS = {
    // Forbidden in all hooks
    FORBIDDEN: [
        'connection', 'expect', 'keep-alive', 'proxy-authenticate',
        'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade',
        'via'
    ],
    // Forbidden ONLY in request hooks
    REQUEST_ONLY_FORBIDDEN: [
        'host'
    ]
};

/**
 * Sandbox & Runtime Configurations
 */
const AWS_RUNTIME = {
    FORBIDDEN_MODULES: ['fs', 'child_process', 'os'],
    DEFAULT_ENV: {
        'AWS_REGION': 'us-east-1',
        'AWS_DEFAULT_REGION': 'us-east-1',
        'AWS_EXECUTION_ENV': 'AWS_Lambda_nodejs20.x',
        'AWS_LAMBDA_FUNCTION_NAME': 'cloudfrontize-emulator',
        'AWS_LAMBDA_FUNCTION_VERSION': '1',
        'AWS_LAMBDA_FUNCTION_MEMORY_SIZE': '128'
    },
    ENV_WHITELIST: [
        'AWS_REGION', 'AWS_DEFAULT_REGION', 'AWS_LAMBDA_FUNCTION_NAME',
        'AWS_LAMBDA_FUNCTION_VERSION', 'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
        'AWS_LAMBDA_LOG_GROUP_NAME', 'AWS_LAMBDA_LOG_STREAM_NAME',
        'AWS_EXECUTION_ENV', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
        'NODE_OPTIONS', 'TZ', 'LANG', 'PATH'
    ]
};

module.exports = { AWS_LIMITS, AWS_HEADERS, AWS_RUNTIME };
