import { getLatestSignal, getSystemSettings } from "@workspace/db";

async function run() {
  try {
     const sig = await getLatestSignal();
     console.log("Latest Signal:", sig);
     
     const set = await getSystemSettings();
     console.log("Settings:", set);
  } catch (e) {
     console.error(e);
  }
}
run();
