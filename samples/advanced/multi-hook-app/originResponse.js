exports.hookType = 'origin-response';

exports.handler = (event, context, callback) => {
    const response = event.Records[0].cf.response;
    console.log(`[Multi-Hook] origin-response fired. Setting Cache-Control header.`);

    response.headers['cache-control'] = [{ key: 'Cache-Control', value: 'public, max-age=86400' }];

    callback(null, response);
};
