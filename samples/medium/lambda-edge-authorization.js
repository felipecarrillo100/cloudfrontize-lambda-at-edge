'use strict';

/**
 * Lambda@Edge Example: Basic Authentication (viewer-request)
 *
 * Hook Type: viewer-request
 *
 * Purpose: Protect your site or specific paths behind a username and password.
 * This runs at the "viewer-request" stage to intercept unauthorized users
 * before CloudFront even checks the cache or contacts the origin.
 *
 * Behavior:
 * - Checks the 'Authorization' header for valid credentials.
 * - If missing or invalid, returns a 401 Unauthorized response.
 * - If valid, passes the request through to CloudFront/Origin.
 *
 * Deploy to: CloudFront → Cache Behaviour → Viewer Request
 */

// The next Line is mandatory or your file will be ignored
// use one of 'viewer-request' | 'viewer-response' | 'origin-response' | 'viewer-request'
exports.hookType = 'viewer-request';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // Configure your credentials here
    const user = "admin";
    const password = "pass";

    // Construct the expected Base64 auth string
    // Note: Buffer.from is used as the modern replacement for 'new Buffer'
    const authString = "Basic " + Buffer.from(user + ":" + password).toString("base64");

    // Check if the Authorization header exists and matches our credentials
    if (
        typeof headers.authorization === "undefined" ||
        headers.authorization[0].value !== authString
    ) {
        const response = {
            status: "401",
            statusDescription: "Unauthorized",
            body: "Unauthorized",
            headers: {
                "www-authenticate": [{
                    key: "WWW-Authenticate",
                    value: 'Basic realm="Protected Area"'
                }],
            },
        };

        // Return the 401 response and stop further execution
        callback(null, response);
        return;
    }

    // Credentials match — let the request continue
    callback(null, request);
};
