'use strict';

/**
 * EXERCISE 2.2: The Diplomat
 * 
 * Scenario: Geo-routing based on viewer country.
 * Hook Type: origin-request
 */

exports.hookType = 'origin-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // TODO: Detect the viewer's country using 'cloudfront-viewer-country'.
    // Rewrite the URI to prepend the country code: /index.html -> /US/index.html

    // Default to 'US' if header is missing.

    return request;
};
