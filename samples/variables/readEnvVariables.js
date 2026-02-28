exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;

    // Attempt to read from process.env
    const region = process.env.AWS_REGION || 'unknown';
    const secret = process.env.MY_PRIVATE_KEY || 'hidden'; // Should be 'hidden' because it's not whitelisted

    request.headers['x-env-region'] = [{ key: 'X-Env-Region', value: region }];
    request.headers['x-env-secret'] = [{ key: 'X-Env-Secret', value: secret }];

    return request;
};
