const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

code = code.replace(
  'timestamp: typeof c.time === \'string\' ? c.time : new Date(c.time).toISOString(),\n                                    direction: "unchanged" as const,\n                                    ms: Date.now(),',
  'timestamp: typeof c.time === \'string\' ? c.time : new Date(c.time).toISOString(),\n                                    direction: "unchanged" as const,\n                                    ms: typeof c.time === \'string\' ? new Date(c.time).getTime() : new Date(c.time).getTime(),'
);

code = code.replace(
  'timestamp: new Date().toISOString(),\n                                            direction: "unchanged" as const,\n                                            ms: Date.now(),',
  'timestamp: price.time ? new Date(price.time).toISOString() : new Date().toISOString(),\n                                            direction: "unchanged" as const,\n                                            ms: price.time ? new Date(price.time).getTime() : Date.now(),'
);

fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', code);
