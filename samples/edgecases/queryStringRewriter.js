exports.hookType = 'origin-request';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;

    // Strip out UTM tracking parameters before they hit the origin cache
    if (request.querystring.includes('utm_source')) {
        const params = new URLSearchParams(request.querystring);
        params.delete('utm_source');
        params.delete('utm_medium');
        params.delete('utm_campaign');
        request.querystring = params.toString();
        console.log(`Stripped UTM tags. New querystring: ${request.querystring}`);
    }

    callback(null, request);
};
