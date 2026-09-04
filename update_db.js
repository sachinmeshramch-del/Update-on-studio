const { getSystemSettings, updateSystemSettings } = require('/app/applet/lib/db/dist/index.js');
async function test() {
  const current = await getSystemSettings();
  console.log("Current:", current);
  await updateSystemSettings({ metaApiSymbol: 'GOLD' });
  console.log("Updated!");
}
test().catch(console.error).then(() => process.exit(0));
