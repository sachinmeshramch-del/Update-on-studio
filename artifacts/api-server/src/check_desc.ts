import { db } from "@workspace/db";
import { doc, getDoc } from "firebase/firestore";
import MetaApi from "metaapi.cloud-sdk";

async function run() {
    const snap = await getDoc(doc(db, "settings", "global"));
    const token = snap.data()?.META_API_TOKEN;
    if (!token) { console.log("No token"); process.exit(1); }

    const metaApi = new MetaApi(token);
    const account = await metaApi.metatraderAccountApi.getAccount("6485ceb1-f6b8-4a1d-85e4-af6de3033116");
    const rpc = account.getRPCConnection();
    await rpc.connect();
    await rpc.waitSynchronized();
    const spec = await rpc.getSymbolSpecification("GOLD");
    console.log("GOLD:", spec.description, spec.path);
    try {
        const spec2 = await rpc.getSymbolSpecification("GOLD24-7");
        console.log("GOLD24-7:", spec2.description, spec2.path);
    } catch {}
    
    // find all symbols
    const syms = await rpc.getSymbols();
    for (const s of syms) {
        if (s.includes('XAU') || s.includes('GOLD')) {
            try {
                const sp = await rpc.getSymbolSpecification(s);
                console.log(s, sp.description, sp.path);
            } catch {}
        }
    }

    process.exit(0);
}
run();
