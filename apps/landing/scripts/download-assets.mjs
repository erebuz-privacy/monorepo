import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const TARGET_URL = 'https://erebuz.net/';
const PUBLIC_DIR = path.resolve('public');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, { rejectUnauthorized: false }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        const redirectUrl = new URL(res.headers.location, url).href;
        return downloadFile(redirectUrl, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

function urlToPath(urlStr) {
  const url = new URL(urlStr);
  let filePath = url.pathname;

  // Handle Next.js static media hashed names
  if (filePath.includes('/_next/static/media/')) {
    const filename = path.basename(filePath);
    filePath = '/images/' + filename;
  }

  // Strip query params
  filePath = filePath.split('?')[0];

  // Ensure we have an extension
  if (!path.extname(filePath)) {
    filePath += '.bin';
  }

  return path.join(PUBLIC_DIR, filePath.replace(/^\//, ''));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() =>
    page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  );

  // Wait for assets to load
  await new Promise(r => setTimeout(r, 3000));

  // Discover all assets
  const assets = await page.evaluate(() => {
    const assetList = [];

    // Images
    document.querySelectorAll('img').forEach(img => {
      const src = img.src || img.currentSrc;
      if (src && !src.startsWith('data:')) {
        assetList.push({ url: src, type: 'image', alt: img.alt });
      }
    });

    // Background images
    document.querySelectorAll('*').forEach(el => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        const matches = bg.match(/url\("([^"]+)"\)/g);
        if (matches) {
          matches.forEach(m => {
            const url = m.replace(/url\("?([^"]+)"?\)/, '$1');
            if (url && !url.startsWith('data:')) {
              assetList.push({ url, type: 'background', element: el.tagName });
            }
          });
        }
      }
    });

    return assetList;
  });

  // Deduplicate by URL
  const seen = new Set();
  const unique = assets.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  console.log(`Found ${unique.length} unique assets to download`);

  // Download with concurrency of 4
  const concurrency = 4;
  let completed = 0;
  let failed = 0;

  async function downloadBatch(batch) {
    const results = await Promise.allSettled(
      batch.map(async (asset) => {
        const dest = urlToPath(asset.url);
        try {
          await downloadFile(asset.url, dest);
          completed++;
          process.stdout.write(`\rDownloaded ${completed}/${unique.length} (${failed} failed)`);
          return { url: asset.url, dest, status: 'ok' };
        } catch (err) {
          failed++;
          process.stdout.write(`\rDownloaded ${completed}/${unique.length} (${failed} failed)`);
          return { url: asset.url, error: err.message, status: 'failed' };
        }
      })
    );
    return results;
  }

  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    await downloadBatch(batch);
  }

  console.log(`\n\nDone: ${completed} succeeded, ${failed} failed`);

  // Save manifest
  const manifest = unique.map(a => ({
    url: a.url,
    localPath: urlToPath(a.url).replace(PUBLIC_DIR, ''),
    type: a.type,
  }));
  fs.writeFileSync(
    path.resolve('docs/research/erebuz.net/assets-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('Asset manifest saved');

  await browser.close();
}

main().catch(err => {
  console.error('Asset download failed:', err);
  process.exit(1);
});
