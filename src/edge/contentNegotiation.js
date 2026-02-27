'use strict';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    const uri = request.uri;

    // 1. Only target JS and CSS files
    if (uri.match(/\.(js|css)$/)) {
        const aeHeader = headers['accept-encoding'];
        const acceptEncoding = (aeHeader && aeHeader.length > 0)
            ? aeHeader[0].value
            : '';

        // 2. Generic rewrite: try to serve a pre-compressed version for ANY js/css file.
        // This is used to bypass CloudFront's 10MB compression limit for large files.
        // If the pre-compressed file doesn't exist, the local server will fall back
        // to the original file automatically (no 404).
        if (acceptEncoding.includes('br')) {
            request.uri += '.br';
        } else if (acceptEncoding.includes('gzip')) {
            request.uri += '.gz';
        }
    }

    callback(null, request);
};
