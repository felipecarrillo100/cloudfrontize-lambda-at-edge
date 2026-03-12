'use strict';

/**
 * AWS Lambda@Edge Strict Limits
 */
const AWS_LIMITS = {
    VIEWER_REQUEST_BODY_BYTES: 40 * 1024,      // 40KB
    GENERATED_RESPONSE_BODY_BYTES: 1024 * 1024, // 1MB
    COMPRESSION_BYPASS_BYTES: 10 * 1024 * 1024, // 10MB
    VIEWER_TIMEOUT_MS: 5000,                  // 5 seconds
    ORIGIN_TIMEOUT_MS: 30000                  // 30 seconds
};

/**
 * AWS CloudFront Functions (CFF) Strict Limits
 */
const CFF_LIMITS = {
    MAX_CODE_SIZE_BYTES: 10 * 1024,           // 10KB
    MAX_CPU_TIME_MS: 1,                       // 1ms (Soft limit warning)
    MAX_TOTAL_TIME_MS: 50                     // 50ms (Hard VM limit)
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
    // Whitelisted built-ins for ALL hook types
    ALLOWED_GLOBAL: ['crypto', 'buffer', 'util', 'path', 'zlib', 'url', 'querystring'],
    
    // Viewer hooks: Global + specific utility modules (No network/disk I/O)
    ALLOWED_VIEWER: [
        'crypto', 'buffer', 'util', 'path', 'zlib', 'url', 'querystring',
        '@aws-sdk/util-utf8', '@aws-sdk/types', '@aws-sdk/util-base64'
    ],
    
    // Origin hooks: All viewer modules + S3/DynamoDB/SecretsManager/AppConfig + File System
    ALLOWED_ORIGIN: [
        'crypto', 'buffer', 'util', 'path', 'zlib', 'url', 'querystring',
        '@aws-sdk/util-utf8', '@aws-sdk/types', '@aws-sdk/util-base64',
        'fs',
        '@aws-sdk/client-s3', '@aws-sdk/client-dynamodb', '@aws-sdk/client-secrets-manager', '@aws-sdk/client-appconfig'
    ],

    FORBIDDEN_MODULES: ['child_process', 'os', 'http', 'https', 'net', 'dns'], // Strict global bans
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

const CFF_RUNTIME = {
    // Strictly NO built-ins for CFF
    ALLOWED_GLOBAL: [], 
    FORBIDDEN_MODULES: ['*'] // Any require() will throw
};

module.exports = { AWS_LIMITS, AWS_HEADERS, AWS_RUNTIME, CFF_LIMITS, CFF_RUNTIME };
