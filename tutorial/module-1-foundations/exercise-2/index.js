'use strict';

/**
 * EXERCISE 1.2: The Librarian
 * 
 * Scenario: Normalize query strings to increase cache hits.
 * Hook Type: viewer-request
 */

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const querystring = request.querystring;

    if (!querystring) {
        return request;
    }

    // TODO: Parse the querystring, sort the keys alphabetically, 
    // and rebuild the querystring.
    // Use URLSearchParams for easier manipulation.

    // Example: 'z=1&a=2' -> 'a=2&z=1'

    return request;
};
