import { startMetaApiFeed } from '/app/applet/artifacts/api-server/dist/lib/metaApiFeed.js';
import { getSystemSettings } from '/app/applet/artifacts/db/dist/index.js';

async function test() {
  console.log("Settings:", await getSystemSettings());
  startMetaApiFeed().catch(console.error);
}
test();
