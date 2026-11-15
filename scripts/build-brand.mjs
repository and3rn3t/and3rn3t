/**
 * Write the site's mark to every file that carries it: favicon.svg, the PWA and touch icons, and
 * the icon the MCP server advertises. The drawing lives in scripts/brand-mark.mjs; edit it there,
 * then run `pnpm build:brand` and commit the result.
 *
 * PNGs are rasterized with sharp (already a devDependency). tests/unit/brand-mark.test.js fails
 * when a checked-in SVG differs from what this would write.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PNG_FILES, SVG_FILES, renderIcon } from './brand-mark.mjs';

const fromRoot = path => fileURLToPath(new URL(`../${path}`, import.meta.url));

for (const [path, svg] of Object.entries(SVG_FILES)) {
  writeFileSync(fromRoot(path), svg);
  console.log(`  wrote ${path}`);
}

for (const [path, icon] of Object.entries(PNG_FILES)) {
  // A square icon has no transparent corners, so it can drop the alpha channel
  const image = sharp(Buffer.from(renderIcon(icon)));
  await (icon.shape === 'square' ? image.removeAlpha() : image)
    .png({ compressionLevel: 9 })
    .toFile(fromRoot(path));
  console.log(`  wrote ${path}`);
}
