const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'icons', 'favicon.svg');
const svg = fs.readFileSync(svgPath);

const sizes = [192, 512];

async function generate() {
  for (const size of sizes) {
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, 'icons', `icon-${size}.png`));
    console.log(`Generated icon-${size}.png`);
  }

  // Generate ICO-style 32x32 for favicon fallback
  await sharp(svg)
    .resize(32, 32)
    .png()
    .toFile(path.join(__dirname, 'icons', 'favicon-32.png'));
  console.log('Generated favicon-32.png');

  // Generate 180x180 apple-touch-icon
  await sharp(svg)
    .resize(180, 180)
    .png()
    .toFile(path.join(__dirname, 'icons', 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');
}

generate().catch(console.error);
