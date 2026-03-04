'use strict';

/**
 * EXERCISE 4.1: The Baker
 * 
 * Scenario: Injected environment variables for production.
 * Hook Type: viewer-request
 */

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    // TODO: Instead of hardcoding 'http://api.local', use the 
    // BAKED global variable 'API_ENDPOINT'.

    // Note: Lambda@Edge does NOT support process.env.
    // CloudFrontize allows you to "bake" variables as global constants.

    const api = (typeof API_ENDPOINT !== 'undefined') ? API_ENDPOINT : 'http://localhost:8080';

    console.log(`Connecting to: ${api}`);

    return event.Records[0].cf.request;
};
