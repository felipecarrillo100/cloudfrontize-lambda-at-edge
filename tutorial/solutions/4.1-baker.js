'use strict';

exports.hookType = 'viewer-request';

const API_ENDPOINT = "__API_ENDPOINT__";

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;

    // API_ENDPOINT should be defined as a global constant via --bake
    const api = (typeof API_ENDPOINT !== 'undefined') ? API_ENDPOINT : 'http://localhost:8080';

    console.log(`[Production] Connecting to: ${api}`);
    request.headers['x-baked-end-point'] = [{ key: 'X-Baked-End-Point', value: api }];

    return event.Records[0].cf.request;
};
