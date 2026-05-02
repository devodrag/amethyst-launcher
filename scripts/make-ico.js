const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

async function main() {
  const root = path.join(__dirname, '..');
  const pngPath = path.join(root, 'assets', 'icon.png');
  const icoPath = path.join(root, 'assets', 'icon.ico');

  if (!fs.existsSync(pngPath)) {
    console.error(`[make-ico] Missing ${pngPath}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(pngPath);
  const ico = await pngToIco(buf);
  fs.writeFileSync(icoPath, ico);
  console.log(`[make-ico] Wrote ${icoPath}`);
}

main().catch((e) => {
  console.error('[make-ico] Failed:', e);
  process.exit(1);
});

