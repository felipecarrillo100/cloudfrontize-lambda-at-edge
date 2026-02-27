'use strict';

/**
 * Lambda@Edge Example: Serve Pre-Compressed Assets (origin-request)
 *
 * Hook Type: origin-request
 *
 * Purpose: Bypass CloudFront's 10MB auto-compression limit by redirecting
 * requests for .js/.css files to pre-compressed .br or .gz versions that are
 * stored alongside the originals at the origin (e.g. S3).
 *
 * The local development server will automatically fall back to the original
 * file if the pre-compressed version does not exist on disk.
 *
 * Deploy to: CloudFront → Cache Behaviour → Origin Request
 */
exports.hookType = 'origin-request';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    const uri = request.uri;

    // Only target JS and CSS files
    if (uri.match(/\.(js|css)$/)) {
        const aeHeader = headers['accept-encoding'];
        const acceptEncoding = (aeHeader && aeHeader.length > 0)
            ? aeHeader[0].value
            : '';

        // Generic rewrite: try to serve a pre-compressed version for any js/css file.
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
