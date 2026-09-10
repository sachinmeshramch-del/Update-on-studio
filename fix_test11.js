const fs = require('fs');
let code = fs.readFileSync('test.ts', 'utf8');

code = code.replace(/return existing\.rpc;\s+const \{ default: MetaApi \} = await import\("metaapi.cloud-sdk\/esm-node"\);/, 
`return existing.rpc;
    }
    const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");`);

code = code.replace(/metaApi = new MetaApi\(token, \{ requestTimeout: 30, connectTimeout: 30 \}\);\s+const account = await metaApi.metatraderAccountApi.getAccount\(trimmed\);/, 
`metaApi = new MetaApi(token, { requestTimeout: 30, connectTimeout: 30 });
    }
    const account = await metaApi.metatraderAccountApi.getAccount(trimmed);`);

code = code.replace(/\]\)\.catch\(\(\) => \{\}\);\s+const rpc = account\.getRPCConnection\(\);/,
`]).catch(() => {});
    }
    const rpc = account.getRPCConnection();`);

fs.writeFileSync('test.ts', code);
