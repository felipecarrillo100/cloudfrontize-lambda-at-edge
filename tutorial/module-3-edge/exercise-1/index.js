'use strict';

/**
 * EXERCISE 3.1: The Bouncer
 * 
 * Scenario: Basic Auth gatekeeper at the edge.
 * Hook Type: viewer-request
 */

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // TODO: Verify the 'authorization' header.
    // Use 'admin:password' as the required credentials.
    // Tip: auth string is 'Basic ' + Buffer.from('admin:password').toString('base64')

    // If missing or wrong, return a 401 response:
    /*
    return {
        status: '401',
        statusDescription: 'Unauthorized',
        headers: {
            'www-authenticate': [{ key: 'WWW-Authenticate', value: 'Basic' }]
        },
        body: 'Unauthorized Access'
    };
    */

    return request;
};
