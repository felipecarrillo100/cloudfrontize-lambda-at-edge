'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    // API_ENDPOINT should be defined as a global constant via --bake
    const api = (typeof API_ENDPOINT !== 'undefined') ? API_ENDPOINT : 'http://localhost:8080';

    console.log(`[Production] Connecting to: ${api}`);

    return event.Records[0].cf.request;
};
