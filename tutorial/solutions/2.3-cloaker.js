'use strict';

exports.hookType = 'origin-response';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    delete headers['server'];
    delete headers['x-powered-by'];

    return response;
};
