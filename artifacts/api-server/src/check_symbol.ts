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
    const symbols = await rpc.getSymbols();
    const goldSymbols = symbols.filter(s => s.toUpperCase().includes('XAU') || s.toUpperCase().includes('GOLD'));
    for (const sym of goldSymbols) {
        try {
            const spec = await rpc.getSymbolSpecification(sym);
            console.log(sym, "Contract Size:", spec.contractSize, "Min Volume:", spec.minVolume, "Max Volume:", spec.maxVolume);
        } catch (e) {
            console.log("Error fetching spec for", sym);
        }
    }
    process.exit(0);
}
run();
