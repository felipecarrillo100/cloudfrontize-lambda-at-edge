exports.hookType = 'viewer-request';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;

    console.log(`\n\x1b[36m[Context Dump]\x1b[0m`);
    console.log(`Function Name: ${context.functionName}`);
    console.log(`Remaining Time: ${context.getRemainingTimeInMillis()}ms`);
    console.log(`AWS Request ID: ${context.awsRequestId}\n`);

    // Emulating what some logging libraries do automatically inside AWS
    if (!context || !context.functionName) {
        throw new Error("Missing context object! Logging library crashed.");
    }

    callback(null, request);
};
