'use strict';

/**
 * EXERCISE 3.2: The Architect
 * 
 * Scenario: Generate a maintenance page directly from the Edge.
 * Hook Type: viewer-request
 */

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    // TODO: Intercept all requests and return a 503 response.
    // The response should have 'Content-Type: text/html'.
    // Use a nice HTML body like '<h1>Site Under Maintenance</h1>'.

    /*
    return {
        status: '503',
        statusDescription: 'Service Unavailable',
        headers: {
            'content-type': [{ key: 'Content-Type', value: 'text/html' }]
        },
        body: '...'
    };
    */

    return event.Records[0].cf.request;
};
