import sharp from 'sharp';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const svgPath = 'C:/Users/MOINS/movi-logo/movi-logo.svg';
const svgBuffer = readFileSync(svgPath);

// Android adaptive icon sizes (mipmap)
const sizes = [
  { name: 'mdpi', size: 48 },
  { name: 'hdpi', size: 72 },
  { name: 'xhdpi', size: 96 },
  { name: 'xxhdpi', size: 144 },
  { name: 'xxxhdpi', size: 192 },
];

const androidResDir = 'C:/Users/MOINS/publihazclick/android/app/src/main/res';

async function generate() {
  // Generate mipmap icons for Android
  for (const { name, size } of sizes) {
    const dir = join(androidResDir, `mipmap-${name}`);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(join(dir, 'ic_launcher.png'));

    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(join(dir, 'ic_launcher_round.png'));

    // Foreground for adaptive icon (108dp padded)
    const fgSize = Math.round(size * 108 / 48);
    await sharp(svgBuffer)
      .resize(fgSize, fgSize)
      .png()
      .toFile(join(dir, 'ic_launcher_foreground.png'));

    console.log(`  ✓ mipmap-${name}: ${size}px`);
  }

  // Generate Play Store icon (512x512)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile('C:/Users/MOINS/publihazclick/android/app/src/main/play-store-icon.png');
  console.log('  ✓ Play Store icon: 512px');

  // Generate splash screen background
  const splashSize = 2048;
  await sharp(svgBuffer)
    .resize(480, 480)
    .extend({
      top: Math.round((splashSize - 480) / 2),
      bottom: Math.round((splashSize - 480) / 2),
      left: Math.round((splashSize - 480) / 2),
      right: Math.round((splashSize - 480) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toFile(join(androidResDir, 'drawable', 'splash.png'));
  console.log('  ✓ splash.png: 2048px');

  console.log('\nDone!');
}

generate().catch(console.error);
