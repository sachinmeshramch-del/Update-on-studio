const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

code = code.replace(
`            lastCandle.volume = (lastCandle.volume || 0) + 1;
}`,
`            lastCandle.volume = (lastCandle.volume || 0) + 1;
        }
    }
}`
);

fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', code);
