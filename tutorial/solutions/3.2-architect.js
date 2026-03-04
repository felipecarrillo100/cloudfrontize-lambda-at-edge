'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    return {
        status: '503',
        statusDescription: 'Service Unavailable',
        headers: {
            'content-type': [{ key: 'Content-Type', value: 'text/html' }]
        },
        body: '<html><body><h1>Site Under Maintenance</h1><p>We will be back shortly.</p></body></html>'
    };
};
