import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TARGET_URL = 'https://erebuz.net/';
const OUTPUT = path.resolve('src/components/icons.tsx');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() =>
    page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  );
  await sleep(3000);

  // Get all unique SVGs with their identifying context
  const svgData = await page.evaluate(() => {
    const svgs = document.querySelectorAll('svg');
    const icons = [];
    const seen = new Set();

    svgs.forEach((svg, i) => {
      const html = svg.outerHTML;
      const viewBox = svg.getAttribute('viewBox') || '';
      const hash = viewBox + html.slice(0, 200);

      if (seen.has(hash)) return;
      seen.add(hash);

      // Find parent text for naming
      const parent = svg.closest('a, button, li, div, section, article');
      const parentText = parent?.textContent?.trim().slice(0, 80) || '';
      const parentClass = parent?.className?.toString().slice(0, 100) || '';
      const ariaLabel = svg.getAttribute('aria-label') || '';
      const role = svg.getAttribute('role') || '';

      icons.push({ index: i, viewBox, width: svg.getAttribute('width'), height: svg.getAttribute('height'), ariaLabel, role, parentText, parentClass, html });
    });
    return icons;
  });

  // Name each icon based on context
  function nameIcon(data) {
    const t = (data.parentText + ' ' + data.ariaLabel).toLowerCase();
    const c = data.parentClass.toLowerCase();
    if (t.includes('erebuz') || t.includes('logo') || (data.viewBox === '0 0 833.3 833.3')) return 'ErebuzLogo';
    if (t.includes('composable') || t.includes('privacy')) return 'ComposablePrivacyIcon';
    if (t.includes('unified') || t.includes('shielded set')) return 'UnifiedShieldedSetIcon';
    if (t.includes('reward')) return 'GetRewardsIcon';
    if (t.includes('shielded action')) return 'ShieldedActionsIcon';
    if (t.includes('ibc') || t.includes('interoper')) return 'IbcInteroperabilityIcon';
    if (t.includes('scroll') || c.includes('scroll')) return 'ScrollToExploreIcon';
    if (t.includes('01') && !t.match(/[a-z]/)) return 'Number01Icon';
    if (t.includes('02') && !t.match(/[a-z]/)) return 'Number02Icon';
    if (t.includes('03') && !t.match(/[a-z]/)) return 'Number03Icon';
    if (t.includes('04') && !t.match(/[a-z]/)) return 'Number04Icon';
    if (t.includes('05') && !t.match(/[a-z]/)) return 'Number05Icon';
    if (t.includes('06') && !t.match(/[a-z]/)) return 'Number06Icon';
    if (t.includes('07') && !t.match(/[a-z]/)) return 'Number07Icon';
    if (t.includes('08') && !t.match(/[a-z]/)) return 'Number08Icon';
    if (t.includes('09') && !t.match(/[a-z]/)) return 'Number09Icon';
    if (t.includes('10') && !t.match(/[a-z]/)) return 'Number10Icon';
    if (t.includes('11') && !t.match(/[a-z]/)) return 'Number11Icon';
    if (t.includes('about') || c.includes('about')) return 'AboutArrowIcon';
    if (t.includes('x.com') || t.includes('twitter') || t.includes('-x-')) return 'XIcon';
    if (t.includes('discord')) return 'DiscordIcon';
    if (t.includes('github')) return 'GithubIcon';
    if (t.includes('youtube')) return 'YoutubeIcon';
    if (t.includes('shield') || t.includes('shield asset')) return 'ShieldIcon';
    if (t.includes('stake') || c.includes('stake')) return 'StakeIcon';
    if (t.includes('govern')) return 'GovernIcon';
    if (data.viewBox && data.viewBox !== '0 0 833.3 833.3') {
      return `Icon${data.index}`;
    }
    return `Icon${data.index}`;
  }

  // Deduplicate and name
  const deduped = [];
  const nameCount = {};
  for (const data of svgData) {
    let name = nameIcon(data);
    if (nameCount[name]) {
      nameCount[name]++;
      name = name + '_' + nameCount[name];
    } else {
      nameCount[name] = 1;
    }
    deduped.push({ ...data, name });
  }

  // Generate React component file
  const imports = `import type { SVGProps } from "react";\n\ntype IconProps = SVGProps<SVGSVGElement>;\n`;
  const components = deduped.map(({ name, viewBox, html }) => {
    // Clean the SVG: replace fill="currentColor" with the prop, etc
    let cleaned = html
      .replace(/<svg[^>]*>/, '')
      .replace('</svg>', '')
      .trim();
    return `export function ${name}({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="${viewBox}"
      fill="none"
      className={className}
      {...props}
    >
      ${cleaned}
    </svg>
  );
}`;
  }).join('\n\n');

  const content = `${imports}\n${components}\n`;
  fs.writeFileSync(OUTPUT, content);
  console.log(`Wrote ${deduped.length} icon components to ${OUTPUT}`);

  // Also save the raw data
  fs.writeFileSync(
    path.resolve('docs/research/erebuz.net/svg-deduped.json'),
    JSON.stringify(deduped.map(d => ({ name: d.name, viewBox: d.viewBox, parentText: d.parentText })), null, 2)
  );

  await browser.close();
}

main().catch(err => {
  console.error('Icon extraction failed:', err);
  process.exit(1);
});
