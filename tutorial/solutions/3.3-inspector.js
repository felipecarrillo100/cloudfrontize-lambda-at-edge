'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;

    if (request.body && request.body.data) {
        const bodyContent = Buffer.from(request.body.data, 'base64').toString();
        if (bodyContent.includes('SQL-INJECTION')) {
            return {
                status: '403',
                statusDescription: 'Forbidden',
                body: 'Malicious request blocked by edge logic.'
            };
        }
    }

    return request;
};
