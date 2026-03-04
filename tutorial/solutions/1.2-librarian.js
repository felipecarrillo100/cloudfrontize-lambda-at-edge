'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const querystring = request.querystring;

    if (!querystring) return request;

    const params = new URLSearchParams(querystring);
    params.sort();

    request.querystring = params.toString();

    return request;
};
