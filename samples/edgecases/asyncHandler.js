exports.hookType = 'origin-request';

exports.handler = async (event, context) => { // Notice there is no callback!
    const request = event.Records[0].cf.request;

    // Simulate a slow async operation like a DB check or external API call
    await new Promise(resolve => setTimeout(resolve, 500));

    // Rewrite URI based on some async logic
    request.uri = '/async-success.html';

    return request; // Resolving the promise instead of using the callback
};
