import { startMetaApiFeed } from "./artifacts/api-server/dist/lib/metaApiFeed.js";
startMetaApiFeed().then(() => console.log("Done")).catch(console.error);
