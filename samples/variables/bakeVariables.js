exports.hookType = 'origin-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;

    // These are injected as string literals by the EdgeRunner
    const apiKey = "__API_KEY__";
    const stage = "__DEPLOY_STAGE__";
    const size = __SCALE__ * 1000;

    request.headers['x-baked-api-key'] = [{ key: 'X-Baked-Api-Key', value: apiKey }];
    request.headers['x-baked-stage'] = [{ key: 'X-Baked-Stage', value: stage }];
    request.headers['x-baked-size'] = [{ key: 'X-Baked-Size', value: size.toFixed(0) }];

    return request;
};
