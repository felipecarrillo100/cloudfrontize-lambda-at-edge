exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    let exploitResult = "blocked";

    try {
        // Attempt 1: Standard require (should be blocked by our hook)
        const fs = require('fs');
        exploitResult = fs.readFileSync('/etc/passwd', 'utf8');
    } catch (e) {
        try {
            // Attempt 2: Using the constructor to find the host's require
            const remoteRequire = module.constructor._load('fs');
            exploitResult = "escaped_via_constructor";
        } catch (e2) {
            exploitResult = "shield_held";
        }
    }

    request.headers['x-exploit-status'] = [{ key: 'X-Exploit-Status', value: exploitResult }];
    return request;
};
