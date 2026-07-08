import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TARGET_URL = 'https://erebuz.net/';
const RESEARCH_DIR = path.resolve('docs/research/erebuz.net');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function extractSectionStyles(page, selector, name) {
  return page.evaluate(({ selector, name }) => {
    const el = document.querySelector(selector);
    if (!el) return { name, error: `Element not found: ${selector}` };

    const props = [
      'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'color',
      'textTransform', 'textDecoration', 'backgroundColor', 'background',
      'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'width', 'height', 'maxWidth', 'minWidth', 'maxHeight', 'minHeight',
      'display', 'flexDirection', 'justifyContent', 'alignItems', 'gap',
      'gridTemplateColumns', 'gridTemplateRows', 'gridColumn', 'gridRow',
      'borderRadius', 'border', 'borderTop', 'borderBottom', 'borderLeft', 'borderRight',
      'boxShadow', 'overflow', 'overflowX', 'overflowY',
      'position', 'top', 'right', 'bottom', 'left', 'zIndex',
      'opacity', 'transform', 'transition', 'cursor',
      'objectFit', 'objectPosition', 'mixBlendMode', 'filter', 'backdropFilter',
      'whiteSpace', 'textOverflow', 'WebkitLineClamp',
      'outline', 'outlineOffset', 'visibility',
      'fill', 'stroke', 'strokeWidth',
    ];

    function extractStyles(element) {
      if (!element || element.nodeType !== 1) return null;
      const cs = getComputedStyle(element);
      const styles = {};
      props.forEach(p => {
        const v = cs[p];
        if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)' && v !== 'transparent') {
          styles[p] = v;
        }
      });
      return styles;
    }

    function walk(element, depth) {
      if (!element || element.nodeType !== 1) return null;
      if (depth > 4) return {
        tag: element.tagName.toLowerCase(),
        classes: element.className?.toString().slice(0, 150) || '',
        text: element.childNodes.length === 1 && element.childNodes[0].nodeType === 3 ? element.textContent.trim().slice(0, 300) : null,
        styles: extractStyles(element),
        images: element.tagName === 'IMG' ? { src: element.src, alt: element.alt } : null,
      };

      const children = [...element.children];
      return {
        tag: element.tagName.toLowerCase(),
        classes: element.className?.toString().slice(0, 150) || '',
        text: element.childNodes.length === 1 && element.childNodes[0].nodeType === 3 ? element.textContent.trim().slice(0, 300) : null,
        styles: extractStyles(element),
        images: element.tagName === 'IMG' ? { src: element.src, alt: element.alt } : null,
        childCount: children.length,
        children: children.slice(0, 30).map(c => walk(c, depth + 1)).filter(Boolean),
      };
    }

    return { name, selector, html: walk(el, 0), text: el.textContent?.trim()?.slice(0, 2000) };
  }, { selector, name });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() =>
    page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  );
  await sleep(3000);

  const sections = [
    { selector: 'nav.fixed', name: 'navbar' },
    { selector: '#interchain-privacy', name: 'hero-section' },
    { selector: '#composable-privacy-layer', name: 'composable-privacy-layer' },
    { selector: '#unified-shielded-set', name: 'unified-shielded-set' },
    { selector: '#get-rewards', name: 'get-rewards' },
    { selector: '#shielded-actions', name: 'shielded-actions' },
    { selector: '#ibc-interoperability', name: 'ibc-interoperability' },
    { selector: '#use-erebuz', name: 'use-erebuz' },
    { selector: '#get-involved', name: 'get-involved' },
    { selector: 'footer.container', name: 'footer' },
  ];

  console.log('Extracting section styles...');
  for (const section of sections) {
    console.log(`  Extracting: ${section.name}...`);
    const data = await extractSectionStyles(page, section.selector, section.name);
    fs.writeFileSync(path.join(RESEARCH_DIR, `section-${section.name}.json`), JSON.stringify(data, null, 2));
  }

  // Extract the scroll indicator
  const scrollIndicator = await page.evaluate(() => {
    const el = document.querySelector('[class*="scroll"]');
    if (!el) return null;
    return {
      text: el.textContent?.trim(),
      styles: getComputedStyle(el),
      html: el.innerHTML?.slice(0, 1000),
    };
  });
  fs.writeFileSync(path.join(RESEARCH_DIR, 'scroll-indicator.json'), JSON.stringify(scrollIndicator, null, 2));

  // Extract the "Mainnet Live" banner
  const mainnetBanner = await page.evaluate(() => {
    const el = document.querySelector('[class*="top-0"]');
    if (!el) return null;
    return {
      text: el.textContent?.trim(),
      classes: el.className,
      styles: getComputedStyle(el),
      html: el.innerHTML?.slice(0, 2000),
    };
  });
  fs.writeFileSync(path.join(RESEARCH_DIR, 'mainnet-banner.json'), JSON.stringify(mainnetBanner, null, 2));

  // Get section screenshots
  console.log('Taking section screenshots...');
  for (const section of sections) {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({ block: 'start' });
    }, section.selector);
    await sleep(500);
    await page.screenshot({
      path: path.resolve(`docs/design-references/erebuz.net/section-${section.name}.png`),
      fullPage: false,
    });
  }

  // Nav hover states - extract links
  const navLinks = await page.evaluate(() => {
    const nav = document.querySelector('nav.fixed');
    if (!nav) return [];
    return Array.from(nav.querySelectorAll('a')).map(a => ({
      text: a.textContent?.trim(),
      href: a.href,
      classes: a.className?.toString(),
      styles: {
        default: getComputedStyle(a),
      },
    }));
  });
  fs.writeFileSync(path.join(RESEARCH_DIR, 'nav-links.json'), JSON.stringify(navLinks, null, 2));

  // Extract the hero CTA buttons
  const ctaButtons = await page.evaluate(() => {
    const btns = document.querySelectorAll('a, button');
    return Array.from(btns)
      .filter(b => b.textContent?.includes('SHIELDING') || b.textContent?.includes('DISCOVER') || b.textContent?.includes('SHIELD') || b.textContent?.includes('LEARN') || b.textContent?.includes('START'))
      .map(b => ({
        text: b.textContent?.trim(),
        href: b.href || '',
        classes: b.className?.toString(),
        styles: getComputedStyle(b),
      }));
  });
  fs.writeFileSync(path.join(RESEARCH_DIR, 'cta-buttons.json'), JSON.stringify(ctaButtons, null, 2));

  console.log('Section extraction complete.');
  await browser.close();
}

main().catch(err => {
  console.error('Extraction failed:', err);
  process.exit(1);
});
