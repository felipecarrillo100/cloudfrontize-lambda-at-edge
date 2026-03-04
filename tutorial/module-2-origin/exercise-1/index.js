'use strict';

/**
 * EXERCISE 2.1: The Scientist
 * 
 * Scenario: Cookie-based A/B testing with URI rewriting.
 * Hook Type: origin-request
 */

exports.hookType = 'origin-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // TODO: Check if the 'X-Experiment' cookie is set to 'v2'.
    // If it is, rewrite request.uri to '/v2' + request.uri.

    // Hint: Cookie headers are joined strings. You may need to parse them.
    // Example: Cookie: x-experiment=v2; session=abc

    return request;
};
