'use strict';

/**
 * Lambda@Edge Example: Redirect HTTP to HTTPS (viewer-request)
 *
 * Hook Type: viewer-request
 *
 * Purpose: Enforce HTTPS by returning a 301 redirect for any request that
 * arrives over plain HTTP. CloudFront sets the `cloudfront-forwarded-proto`
 * header to indicate the original protocol used by the viewer.
 *
 * Note: In local development (HTTP only) this redirect will fire for every
 * request since there is no HTTPS. Use the `--https` flag (planned) or
 * disable this Lambda locally when testing other behaviours.
 *
 * Deploy to: CloudFront → Cache Behaviour → Viewer Request
 */
exports.hookType = 'viewer-request';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // Check the protocol forwarded by CloudFront
    const proto = headers['cloudfront-forwarded-proto'];
    const isHttp = proto && proto[0] && proto[0].value === 'http';

    if (isHttp) {
        const host = headers['host'] && headers['host'][0]
            ? headers['host'][0].value
            : 'localhost';

        return callback(null, {
            status: '301',
            statusDescription: 'Moved Permanently',
            headers: {
                location: [{
                    key: 'Location',
                    value: `https://${host}${request.uri}`
                }],
                'cache-control': [{
                    key: 'Cache-Control',
                    value: 'max-age=3600'
                }]
            }
        });
    }

    // Request is already HTTPS — pass through unchanged
    callback(null, request);
};
