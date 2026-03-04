'use strict';

/**
 * EXERCISE 1.1: The Security Guard
 * 
 * Scenario: Inject missing security headers into the response.
 * Hook Type: viewer-response
 */

exports.hookType = 'viewer-response';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    // TODO: Add 'Strict-Transport-Security' set to 'max-age=63072000; includeSubDomains; preload'
    // TODO: Add 'X-Content-Type-Options' set to 'nosniff'

    // Hint: Headers in Lambda@Edge are arrays of { key, value } objects.
    // Example: headers['my-header'] = [{ key: 'My-Header', value: 'my-value' }];

    return response;
};
