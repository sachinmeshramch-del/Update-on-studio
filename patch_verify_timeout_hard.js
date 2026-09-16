const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    logger.warn(
        { positionId, elapsedMs: Date.now() - startTime },
        "[Verify-before-Update] Timeout verifying position status; aborting update to prevent race conditions"
    );
    return {
        canUpdate: false,
        status: "TIMEOUT",
        reason: \`Verification timed out after \${Date.now() - startTime}ms without confirming active position\`
    };`;

const replace = `    logger.warn(
        { positionId, elapsedMs: Date.now() - startTime },
        "[Verify-before-Update] Timeout verifying position status; allowing update anyway to avoid abandoning trade."
    );
    return {
        canUpdate: true,
        status: "TIMEOUT_BYPASSED",
        reason: \`Verification timed out but bypassed to ensure stops are placed\`
    };`;

if (code.includes(target) && !code.includes('TIMEOUT_BYPASSED')) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
