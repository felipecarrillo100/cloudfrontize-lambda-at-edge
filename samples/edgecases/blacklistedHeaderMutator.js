exports.hookType = 'viewer-response';

exports.handler = (event, context, callback) => {
    const response = event.Records[0].cf.response;

    // Mutating headers that CloudFront strictly controls
    response.headers['host'] = [{ key: 'Host', value: 'malicious-host.com' }];
    response.headers['via'] = [{ key: 'Via', value: 'my-custom-proxy' }];

    // Adding custom allowed headers
    response.headers['x-custom-header'] = [{ key: 'X-Custom-Header', value: 'allowed' }];

    callback(null, response);
};
