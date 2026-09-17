const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

const target1 = `            } else {
                logger.warn({ accountType, accountId: targetAccountId, err: errMsg }, \`[MetaApi \${accountType}] Streaming execution failed, attempting fast RPC connection fallback...\`);
            }
        }`;
const replace1 = `            } else {
                logger.warn({ accountType, accountId: targetAccountId, err: errMsg }, \`[MetaApi \${accountType}] Streaming execution failed, attempting fast RPC connection fallback...\`);
            }
        }
    }`;

code = code.replace(target1, replace1);

const target2 = `        } catch (retryErr: any) {
            logger.error({ accountType, accountId: targetAccountId, err: retryErr?.message || String(retryErr) }, \`[MetaApi \${accountType}] Trade execution failed\`);
            throw err;
        }
    }
}
}

export async function executeTrade(direction: "LONG" | "SHORT", stopLoss: number, takeProfit: number, volume: number = 0.01) {`;

const replace2 = `        } catch (retryErr: any) {
            logger.error({ accountType, accountId: targetAccountId, err: retryErr?.message || String(retryErr) }, \`[MetaApi \${accountType}] Trade execution failed\`);
            throw err;
        }
    }
}

export async function executeTrade(direction: "LONG" | "SHORT", stopLoss: number, takeProfit: number, volume: number = 0.01) {`;

code = code.replace(target2, replace2);

fs.writeFileSync(file, code);
