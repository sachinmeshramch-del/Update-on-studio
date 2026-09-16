const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    if (!verification.canUpdate) {
        logger.warn(
            { positionId, reason, verificationStatus: verification.status, failureReason: verification.reason },
            \`[Verify-before-Update] Pre-update verification failed. Aborting MetaApi SL/TP modification.\`
        );
        return { success: false, reason: verification.reason };
    }`;

const replace = `    if (!verification.canUpdate) {
        // Log the failure, but attempt a blind RPC update as a fallback
        logger.warn(
            { positionId, reason, verificationStatus: verification.status, failureReason: verification.reason },
            \`[Verify-before-Update] Pre-update verification failed. Attempting blind RPC SL/TP modification fallback.\`
        );
        
        // Attempt blind fallback
        try {
            const rpc = await getOrInitRpcConnection(accountId);
            let fallbackSL = params.stopLoss !== undefined ? Number(params.stopLoss.toFixed(2)) : 0;
            let fallbackTP = params.takeProfit !== undefined ? Number(params.takeProfit.toFixed(2)) : 0;
            
            if (fallbackSL > 0 || fallbackTP > 0) {
                 await rpc.modifyPosition(positionId, fallbackSL || undefined, fallbackTP || undefined);
                 logger.info({ positionId, fallbackSL, fallbackTP }, "Blind fallback SL/TP attachment succeeded");
                 return { success: true, reason: "BLIND_FALLBACK_SUCCESS", calibratedSL: fallbackSL, calibratedTP: fallbackTP };
            }
        } catch (blindErr: any) {
             logger.error({ err: blindErr?.message }, "Blind fallback SL/TP attachment failed");
        }
        
        return { success: false, reason: verification.reason };
    }`;

if (code.includes(target) && !code.includes('BLIND_FALLBACK_SUCCESS')) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
