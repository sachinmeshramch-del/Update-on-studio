const fs = require('fs');
let code = fs.readFileSync('test.ts', 'utf8');
code = code.replace(
`export async function getLivePrice() {
    if (!connection || !connection.terminalState) return null;
    const price = connection.terminalState.price(SYMBOL);
    if (!price) return null;
    return {
        bid: price.bid,
        ask: price.ask,
        spread: Number((price.ask - price.bid).toFixed(2))
}`,
`export async function getLivePrice() {
    if (!connection || !connection.terminalState) return null;
    const price = connection.terminalState.price(SYMBOL);
    if (!price) return null;
    return {
        bid: price.bid,
        ask: price.ask,
        spread: Number((price.ask - price.bid).toFixed(2))
    };
}`);
fs.writeFileSync('test.ts', code);
