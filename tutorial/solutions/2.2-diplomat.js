'use strict';

exports.hookType = 'origin-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    const country = (headers['cloudfront-viewer-country'] &&
        headers['cloudfront-viewer-country'][0].value) || 'US';

    request.uri = `/${country}${request.uri}`;

    return request;
};
