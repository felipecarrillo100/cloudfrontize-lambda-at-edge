'use strict';

/**
 * EXERCISE 1.3: The Concierge
 * 
 * Scenario: Redirect mobile users to a mobile-specific page.
 * Hook Type: viewer-request
 */

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // TODO: Detect if the viewer is on mobile using the 'cloudfront-is-mobile-viewer' header.
    // If it is 'true', return a 302 redirect response to 'https://m.example.com' + request.uri

    // Note: CloudFront adds these headers automatically. In the emulator, 
    // we mock these headers for you!

    return request;
};
