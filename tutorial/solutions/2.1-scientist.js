'use strict';

exports.hookType = 'origin-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    if (headers.cookie) {
        const hasExperiment = headers.cookie.some(c => c.value.includes('experiment=true'));
        if (hasExperiment) {
            request.uri = '/experimental' + request.uri;
        }
    }

    return request;
};
