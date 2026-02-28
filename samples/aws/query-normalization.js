exports.hookType = 'viewer-request';
exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    if (request.querystring) {
        const params = new URLSearchParams(request.querystring.toLowerCase());
        const sorted = new URLSearchParams([...params].sort());
        request.querystring = sorted.toString();
        request.url = `${request.uri}?${request.querystring}`;
    }
    callback(null, request);
};
