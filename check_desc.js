const { default: MetaApi } = require("metaapi.cloud-sdk");
async function run() {
    const metaApi = new MetaApi(process.env.META_API_TOKEN);
    const account = await metaApi.metatraderAccountApi.getAccount("6485ceb1-f6b8-4a1d-85e4-af6de3033116");
    const rpc = account.getRPCConnection();
    await rpc.connect();
    await rpc.waitSynchronized();
    const spec = await rpc.getSymbolSpecification("GOLD");
    console.log(spec.description, spec.path);
    const spec2 = await rpc.getSymbolSpecification("GOLD24-7");
    console.log(spec2.description, spec2.path);
    process.exit(0);
}
run();
