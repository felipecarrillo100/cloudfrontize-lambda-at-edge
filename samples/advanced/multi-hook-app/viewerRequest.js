exports.hookType = 'viewer-request';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    console.log(`[Multi-Hook] viewer-request fired for URI: ${request.uri}`);
    callback(null, request);
};
