const fs = require('fs');
let code = fs.readFileSync('test.ts', 'utf8').split('\n');

const newCode = [];
let i = 0;
while(i < code.length) {
    if (i === 341) {
        newCode.push(code[i]); // return;
        newCode.push('    }'); // Added for if (isConnecting)
    } else if (i === 343) {
        newCode.push(code[i]);
        newCode.push('    }'); // Added for if (metaApiStatus === "connected")
    } else if (i === 374) {
        newCode.push(code[i]);
        newCode.push('            }'); // Added for if (hasInvalidIds)
        newCode.push('        }'); // Added for if (!token || candidateAccountIds.length === 0)
    } else if (i === 381) {
        newCode.push('            });'); // close new MetaApi config
        newCode.push('        }'); // close if (!metaApi)
    } else if (i === 391) {
        newCode.push(code[i]);
        newCode.push('            } catch(e) {}'); // close try
        newCode.push('        }'); // close if (connection)
    } else if (i === 401) {
        newCode.push(code[i]);
        newCode.push('                }'); // close if (account.state !== DEPLOYED)
    } else if (i === 404) {
        newCode.push(code[i]);
        newCode.push('                } catch(waitErr: any) {}'); // close try
    } else if (i === 412) {
        newCode.push(code[i]);
        newCode.push('                    }'); // close if (!isSync)
    } else if (i === 415) {
        newCode.push(code[i]);
        newCode.push('                    }'); // close if (!syncErr...)
        newCode.push('                } catch(syncErr: any) {}'); // close try
    } else if (i === 449) {
        newCode.push(code[i]);
        newCode.push('                                        };'); // close live object? Wait, line 448 is source. Line 449 is setLatestPrice(live);
        // Wait, line 436 `const live = {` doesn't have closing brace!
        // Let's check line 449.
    } else {
        newCode.push(code[i]);
    }
    i++;
}
fs.writeFileSync('test2.ts', newCode.join('\n'));
