const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalScheduler.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `async function runScheduledSignal(): Promise<void> {
  if (isScheduling) return;
  isScheduling = true;
  try {`;
const replace = `async function runScheduledSignal(): Promise<void> {
  if (isScheduling) return;
  isScheduling = true;
  try {
    logger.info("Scheduler running check...");`;

if (code.includes(target) && !code.includes('Scheduler running check')) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
