'use strict';

/**
 * EXERCISE 3.3: The Inspector
 * 
 * Scenario: Request body validation/filtering.
 * Hook Type: viewer-request
 */

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;

    // TODO: Check if the request has a body.
    // If it exists, decode it from base64 and check for 'SQL-INJECTION'.
    // If found, return a 403 Forbidden.

    /*
    if (request.body && request.body.data) {
        const bodyContent = Buffer.from(request.body.data, 'base64').toString();
        if (bodyContent.includes('SQL-INJECTION')) {
            return { status: '403', body: 'Blocked by Edge Firewall' };
        }
    }
    */

    return request;
};
