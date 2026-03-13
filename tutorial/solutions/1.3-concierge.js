'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    const isMobile = headers['cloudfront-is-mobile-viewer'] &&
        headers['cloudfront-is-mobile-viewer'][0].value === 'true';

    if (isMobile) {
        const qs = request.querystring ? '?' + request.querystring : '';
        const destination = `https://m.example.com${request.uri}${qs}`;
        return {
            status: '302',
            statusDescription: 'Found',
            headers: {
                location: [{ key: 'Location', value: destination }]
            }
        };
    }

    return request;
};
