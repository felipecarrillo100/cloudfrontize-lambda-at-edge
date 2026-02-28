exports.handler = async (event) => {
    global.POISON = "leaked"; // Attempt to pollute the global namespace
    return event.Records[0].cf.request;
};
