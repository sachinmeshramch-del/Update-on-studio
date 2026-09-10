const fs = require('fs');
let code = fs.readFileSync('test.ts', 'utf8');
code = code.replace(
`            candles.push({
                time: Math.floor(candleStartTime / 1000),
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 1
            if (candles.length > 500) candles.shift();`,
`            candles.push({
                time: Math.floor(candleStartTime / 1000),
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 1
            });
            if (candles.length > 500) candles.shift();`);

code = code.replace(
`            lastCandle.volume = (lastCandle.volume || 0) + 1;
}

function isValidAccountId(id: any): boolean {`,
`            lastCandle.volume = (lastCandle.volume || 0) + 1;
        }
    }
}

function isValidAccountId(id: any): boolean {`);

fs.writeFileSync('test.ts', code);
