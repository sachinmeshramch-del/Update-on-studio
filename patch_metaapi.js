const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `export async function getOpenBrokerPositions(): Promise<BrokerPosition[]> {
    // 1. Zero-latency path (<1ms): return in-memory live positions updated by streaming WebSocket
    if (liveBrokerPositions.size > 0) {
        return Array.from(liveBrokerPositions.values());
    }`;
const replace = `export async function getOpenBrokerPositions(): Promise<BrokerPosition[]> {
    // Refresh the in-memory map from terminalState first to ensure it's not holding onto ghosts
    if (connection && connection.terminalState?.positions) {
        const rawPosIds = connection.terminalState.positions.map(p => String(p.id));
        for (const [key, _] of liveBrokerPositions.entries()) {
            if (!rawPosIds.includes(key)) {
                liveBrokerPositions.delete(key);
            }
        }
    }

    // 1. Zero-latency path (<1ms): return in-memory live positions updated by streaming WebSocket
    if (liveBrokerPositions.size > 0) {
        return Array.from(liveBrokerPositions.values());
    }`;

if (code.includes('if (liveBrokerPositions.size > 0)') && !code.includes('rawPosIds')) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
