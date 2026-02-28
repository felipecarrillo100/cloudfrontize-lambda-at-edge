exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const status = global.POISON || "clean";
    request.headers['x-sandbox-state'] = [{ key: 'X-Sandbox-State', value: status }];
    return request;
};
