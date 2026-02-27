'use strict';

/**
 * Lambda@Edge Example: Add Security Headers (viewer-response)
 *
 * Hook Type: viewer-response
 *
 * Purpose: Inject security-related HTTP response headers on every response
 * sent to the viewer. This is a common production practice to harden a
 * CloudFront-served site against common web vulnerabilities.
 *
 * Headers added:
 *   - Strict-Transport-Security (HSTS)
 *   - X-Frame-Options
 *   - X-Content-Type-Options
 *   - Referrer-Policy
 *   - Permissions-Policy
 *   - Content-Security-Policy (basic example — customise for your app)
 *
 * Deploy to: CloudFront → Cache Behaviour → Viewer Response
 */
exports.hookType = 'viewer-response';

exports.handler = (event, context, callback) => {
    const response = event.Records[0].cf.response;

    const securityHeaders = {
        'strict-transport-security': [{
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
        }],
        'x-frame-options': [{
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
        }],
        'x-content-type-options': [{
            key: 'X-Content-Type-Options',
            value: 'nosniff'
        }],
        'referrer-policy': [{
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
        }],
        'permissions-policy': [{
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
        }],
        'content-security-policy': [{
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
        }]
    };

    // Merge security headers into the response (do not overwrite existing ones)
    for (const [name, value] of Object.entries(securityHeaders)) {
        if (!response.headers[name]) {
            response.headers[name] = value;
        }
    }

    callback(null, response);
};
