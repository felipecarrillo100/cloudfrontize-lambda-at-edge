'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    const expected = 'Basic ' + Buffer.from('admin:password').toString('base64');

    if (!headers.authorization || headers.authorization[0].value !== expected) {
        return {
            status: '401',
            statusDescription: 'Unauthorized',
            headers: {
                'www-authenticate': [{ key: 'WWW-Authenticate', value: 'Basic' }]
            },
            body: '<h1>Unauthorized</h1>'
        };
    }

    return request;
};
