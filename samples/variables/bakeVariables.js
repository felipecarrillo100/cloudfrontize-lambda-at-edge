exports.hookType = 'origin-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;

    // These are injected as string literals by the EdgeRunner
    const apiKey = "__API_KEY__";
    const stage = "__DEPLOY_STAGE__";

    request.headers['x-baked-api-key'] = [{ key: 'X-Baked-Api-Key', value: apiKey }];
    request.headers['x-baked-stage'] = [{ key: 'X-Baked-Stage', value: stage }];

    return request;
};
