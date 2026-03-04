'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    const isMobile = headers['cloudfront-is-mobile-viewer'] &&
        headers['cloudfront-is-mobile-viewer'][0].value === 'true';

    if (isMobile) {
        return {
            status: '302',
            statusDescription: 'Found',
            headers: {
                location: [{ key: 'Location', value: 'https://m.example.com' + request.uri }]
            }
        };
    }

    return request;
};
