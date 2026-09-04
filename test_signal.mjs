import { generateSignal } from 'file:///app/applet/artifacts/api-server/dist/lib/signalEngine.js';
import { getSystemSettings } from 'file:///app/applet/artifacts/db/dist/index.js'; // to initialize db if needed

async function test() {
  const result = await generateSignal(4380);
  console.log(JSON.stringify(result, null, 2));
}
test().catch(console.error).then(() => process.exit(0));
