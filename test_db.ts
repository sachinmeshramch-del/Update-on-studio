import { getRunningTrades } from "@workspace/db";
async function run() {
  try {
    const res = await getRunningTrades();
    console.log("Success", res);
  } catch (e) {
    console.error("Error", e);
  }
}
run();
