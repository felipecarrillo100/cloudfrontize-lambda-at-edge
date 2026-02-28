exports.hookType = 'viewer-request';
exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    if (headers['cloudfront-is-mobile-viewer'] && headers['cloudfront-is-mobile-viewer'][0].value === 'true') {
        const response = {
            status: '302',
            statusDescription: 'Found',
            headers: {
                location: [{ key: 'Location', value: `https://m.example.com${request.uri}` }]
            }
        };
        return callback(null, response);
    }
    callback(null, request);
};
