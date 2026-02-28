exports.handler = async (event) => {
    const request = event.Records[0].cf.request;

    // Start a timer that tries to change the request AFTER we return
    setTimeout(() => {
        request.method = "ZOMBIE_METHOD";
    }, 10);

    return request; // Return immediately
};
