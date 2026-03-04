'use strict';

/**
 * EXERCISE 2.3: The Cloaker
 * 
 * Scenario: Security hardening by stripping sensitive headers.
 * Hook Type: origin-response
 */

exports.hookType = 'origin-response';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    // TODO: Delete the 'server' and 'x-powered-by' headers if they exist.

    // Hint: In JavaScript, use the 'delete' keyword on the headers object.

    return response;
};
