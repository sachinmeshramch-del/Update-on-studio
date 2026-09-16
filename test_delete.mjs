import fs from 'fs';
const routerFile = 'artifacts/api-server/src/routes/trading.ts';
let code = fs.readFileSync(routerFile, 'utf8');

const route = `
router.get('/test-delete', async (req, res) => {
  try {
    const { deleteSignalById } = await import('@workspace/db');
    await deleteSignalById('AtjXs3HwdZfzfy1Yb0x7');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
`;

code = code.replace(/export default router;/, route + '\nexport default router;');
fs.writeFileSync(routerFile, code);
