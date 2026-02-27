'use strict';

/**
 * Lambda@Edge Example: Inject Cache-Control Headers (origin-response)
 *
 * Hook Type: origin-response
 *
 * Purpose: Add appropriate Cache-Control headers based on file type after
 * the origin has responded. Hashed/fingerprinted assets (JS, CSS, fonts) are
 * safe to cache immutably. HTML and other files get a shorter TTL.
 *
 * Deploy to: CloudFront → Cache Behaviour → Origin Response
 */
exports.hookType = 'origin-response';

exports.handler = (event, context, callback) => {
    const response = event.Records[0].cf.response;
    const request = event.Records[0].cf.request;
    const uri = request.uri;

    // Immutable long-lived cache for fingerprinted/hashed static assets
    const isImmutableAsset = uri.match(/\.(js|css|woff2?|ttf|eot|otf|png|jpg|jpeg|gif|svg|ico|webp)(\.(br|gz))?$/);

    if (isImmutableAsset) {
        response.headers['cache-control'] = [{
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
        }];
    } else {
        // HTML and other files — short TTL to allow updates
        response.headers['cache-control'] = [{
            key: 'Cache-Control',
            value: 'public, max-age=3600, must-revalidate'
        }];
    }

    callback(null, response);
};
