import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TARGET_URL = 'https://erebuz.net/';
const OUTPUT_DIR = path.resolve('docs');
const RESEARCH_DIR = path.join(OUTPUT_DIR, 'research', 'erebuz.net');
const DESIGN_DIR = path.join(OUTPUT_DIR, 'design-references', 'erebuz.net');

fs.mkdirSync(RESEARCH_DIR, { recursive: true });
fs.mkdirSync(DESIGN_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('Navigating to', TARGET_URL);
  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log('networkidle timeout, trying domcontentloaded...');
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  await sleep(3000); // Let any animations settle

  // === FULL PAGE SCREENSHOTS ===
  console.log('Taking full page screenshots...');
  await page.screenshot({ path: path.join(DESIGN_DIR, 'fullpage-desktop.png'), fullPage: true });

  // Mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(1000);
  await page.screenshot({ path: path.join(DESIGN_DIR, 'fullpage-mobile.png'), fullPage: true });

  // Back to desktop
  await page.setViewportSize({ width: 1440, height: 900 });
  await sleep(1000);

  // === GLOBAL EXTRACTION ===
  console.log('Extracting global styles...');
  const globalData = await page.evaluate(() => {
    const allElements = Array.from(document.querySelectorAll('*')).slice(0, 500);

    // Fonts detected
    const fontFamilies = [...new Set(allElements.map(el => getComputedStyle(el).fontFamily))];

    // Font links
    const fontLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href);

    // Favicons
    const favicons = Array.from(document.querySelectorAll('link[rel*="icon"], link[rel="apple-touch-icon"]')).map(l => ({
      href: l.href,
      rel: l.rel,
      sizes: l.sizes?.toString() || '',
      type: l.type || '',
    }));

    // Meta tags
    const metaTags = Array.from(document.querySelectorAll('meta')).map(m => ({
      name: m.getAttribute('name') || m.getAttribute('property') || '',
      content: m.getAttribute('content') || '',
    }));

    // Background colors
    const bgColors = [...new Set(allElements.map(el => getComputedStyle(el).backgroundColor).filter(c => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent'))];

    // Text colors
    const textColors = [...new Set(allElements.map(el => getComputedStyle(el).color).filter(c => c && c !== 'rgba(0, 0, 0, 0)'))];

    return { fontFamilies, fontLinks, favicons, metaTags, bgColors, textColors };
  });

  fs.writeFileSync(path.join(RESEARCH_DIR, 'global-styles.json'), JSON.stringify(globalData, null, 2));
  console.log('Global styles saved.');

  // === PAGE TOPOLOGY ===
  console.log('Extracting page topology...');
  const topology = await page.evaluate(() => {
    const sections = [];
    // Get all major sections of the page
    const potentialSections = document.querySelectorAll('section, div[class*="section"], div[class*="hero"], div[class*="feature"], div[class*="content"], nav, footer, header, main > div, [data-section], [id]');

    potentialSections.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 50) {
        const cs = getComputedStyle(el);
        sections.push({
          index: i,
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          classes: el.className?.toString().slice(0, 200) || '',
          rect: { top: rect.top, width: rect.width, height: rect.height },
          display: cs.display,
          position: cs.position,
          zIndex: cs.zIndex,
          bgColor: cs.backgroundColor,
          textContent: (el.textContent || '').trim().slice(0, 150),
          childCount: el.children.length,
        });
      }
    });

    return sections.filter(s => s.rect.height > 80);
  });

  fs.writeFileSync(path.join(RESEARCH_DIR, 'page-topology.json'), JSON.stringify(topology, null, 2));
  console.log(`Page topology saved: ${topology.length} sections found.`);

  // === ASSET DISCOVERY ===
  console.log('Discovering assets...');
  const assets = await page.evaluate(() => ({
    images: [...document.querySelectorAll('img')].map(img => ({
      src: img.src,
      alt: img.alt,
      width: img.naturalWidth,
      height: img.naturalHeight,
      parentClasses: img.parentElement?.className?.slice(0, 100) || '',
      position: getComputedStyle(img).position,
      zIndex: getComputedStyle(img).zIndex,
    })),
    videos: [...document.querySelectorAll('video')].map(v => ({
      src: v.src || v.querySelector('source')?.src || '',
      poster: v.poster || '',
      autoplay: v.autoplay,
      loop: v.loop,
      muted: v.muted,
    })),
    backgroundImages: [...document.querySelectorAll('*')]
      .filter(el => {
        const bg = getComputedStyle(el).backgroundImage;
        return bg && bg !== 'none' && bg.includes('url');
      })
      .slice(0, 100)
      .map(el => ({
        url: getComputedStyle(el).backgroundImage,
        element: el.tagName + (el.className ? '.' + el.className.toString().split(' ').slice(0, 2).join('.') : ''),
      })),
    svgCount: document.querySelectorAll('svg').length,
  }));

  fs.writeFileSync(path.join(RESEARCH_DIR, 'assets.json'), JSON.stringify(assets, null, 2));
  console.log(`Assets discovered: ${assets.images.length} images, ${assets.videos.length} videos, ${assets.backgroundImages.length} bg images, ${assets.svgCount} SVGs`);

  // === EXTRACT ALL SVG ICONS ===
  console.log('Extracting SVG icons...');
  const svgIcons = await page.evaluate(() => {
    const svgs = document.querySelectorAll('svg');
    const icons = [];
    svgs.forEach((svg, i) => {
      const html = svg.outerHTML;
      const viewBox = svg.getAttribute('viewBox') || '';
      const width = svg.getAttribute('width') || svg.getBoundingClientRect().width;
      const height = svg.getAttribute('height') || svg.getBoundingClientRect().height;
      // Try to find a name from aria-label, title, or parent text
      const title = svg.querySelector('title')?.textContent || svg.getAttribute('aria-label') || '';
      const parentText = svg.closest('a, button, li, div')?.textContent?.trim().slice(0, 50) || '';
      icons.push({ index: i, viewBox, width, height, title, parentText, html });
    });
    return icons;
  });

  fs.writeFileSync(path.join(RESEARCH_DIR, 'svg-icons.json'), JSON.stringify(svgIcons, null, 2));
  console.log(`${svgIcons.length} SVGs extracted.`);

  // === INTERACTION SWEEP ===
  console.log('Performing scroll sweep...');
  const scrollBehaviors = [];

  // Record header state at top
  const headerInitial = await page.evaluate(() => {
    const header = document.querySelector('header, nav, [class*="header"], [class*="navbar"]');
    if (!header) return null;
    const cs = getComputedStyle(header);
    return {
      bgColor: cs.backgroundColor,
      boxShadow: cs.boxShadow,
      height: cs.height,
      position: cs.position,
      backdropFilter: cs.backdropFilter,
      transform: cs.transform,
      opacity: cs.opacity,
    };
  });

  // Scroll down slowly
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const scrollStep = 200;
  let scrollPos = 0;
  let headerChangedAt = null;

  while (scrollPos < scrollHeight) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollPos);
    await sleep(100);

    // Check header at each position
    const headerState = await page.evaluate(() => {
      const header = document.querySelector('header, nav, [class*="header"], [class*="navbar"]');
      if (!header) return null;
      const cs = getComputedStyle(header);
      return { bgColor: cs.backgroundColor, boxShadow: cs.boxShadow, transform: cs.transform, opacity: cs.opacity };
    });

    if (headerState && headerInitial) {
      if (headerState.bgColor !== headerInitial.bgColor || headerState.boxShadow !== headerInitial.boxShadow) {
        if (headerChangedAt === null) headerChangedAt = scrollPos;
      }
    }

    // Check for elements animating into view
    const visibleAnimated = await page.evaluate(() => {
      const anim = document.querySelectorAll('[class*="animate"], [class*="reveal"], [class*="fade"], [class*="appear"], [data-aos], [data-animation]');
      return Array.from(anim).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      }).length;
    });

    scrollPos += scrollStep;
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  scrollBehaviors.push({ headerChangedAt, headerInitial });

  console.log(`Header changed at scroll position: ${headerChangedAt}px`);

  // === CLICK SWEEP ===
  console.log('Performing click sweep...');
  const clickableElements = await page.evaluate(() => {
    const els = document.querySelectorAll('a, button, [role="button"], [tabindex]:not([tabindex="-1"]), input, select, [onclick]');
    return Array.from(els).map((el, i) => ({
      index: i,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 80),
      href: el.href || '',
      classes: el.className?.toString().slice(0, 100) || '',
      rect: el.getBoundingClientRect(),
      id: el.id || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      type: el.getAttribute('type') || '',
    })).filter(el => el.rect.width > 0 && el.rect.height > 0);
  });

  fs.writeFileSync(path.join(RESEARCH_DIR, 'clickable-elements.json'), JSON.stringify(clickableElements, null, 2));
  console.log(`${clickableElements.length} clickable elements found.`);

  // Try clicking tabs/pills to extract multi-state content
  console.log('Looking for tab/pill navigation...');
  const tabsData = await page.evaluate(() => {
    const tabs = document.querySelectorAll('[role="tab"], [class*="tab"], button[class*="pill"], [class*="tab"] button, [class*="nav-item"]');
    const tabGroups = [];
    tabs.forEach(tab => {
      const parent = tab.closest('[role="tablist"], [class*="tabs"], nav, [class*="nav"]');
      tabGroups.push({
        text: tab.textContent?.trim() || '',
        parentClass: parent?.className?.slice(0, 100) || '',
        rect: tab.getBoundingClientRect(),
        selected: tab.getAttribute('aria-selected') || tab.classList.contains('active') || '',
      });
    });
    return tabGroups;
  });

  fs.writeFileSync(path.join(RESEARCH_DIR, 'tabs.json'), JSON.stringify(tabsData, null, 2));
  console.log(`${tabsData.length} tab elements found.`);

  // === EXTRACT COMPUTED STYLES PER SECTION ===
  console.log('Extracting computed styles for key sections...');
  // Get text content of the full page for extraction
  const fullText = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(path.join(RESEARCH_DIR, 'full-text.txt'), fullText);

  // Extract head links and scripts
  const headData = await page.evaluate(() => {
    return {
      links: Array.from(document.querySelectorAll('link')).map(l => ({ rel: l.rel, href: l.href, as: l.as })),
      scripts: Array.from(document.querySelectorAll('script')).map(s => ({ src: s.src, type: s.type })),
      title: document.title,
    };
  });
  fs.writeFileSync(path.join(RESEARCH_DIR, 'head-data.json'), JSON.stringify(headData, null, 2));

  // === RESPONSIVE SWEEP ===
  console.log('Responsive sweep...');
  const responsiveData = {};
  for (const [name, width] of [['desktop', 1440], ['tablet', 768], ['mobile', 390]]) {
    await page.setViewportSize({ width, height: 900 });
    await sleep(1000);
    const layout = await page.evaluate(() => {
      const bodyStyle = getComputedStyle(document.body);
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        bodyDisplay: bodyStyle.display,
        bodyFlexDirection: bodyStyle.flexDirection,
        scrollbarWidth: window.innerWidth - document.documentElement.clientWidth,
      };
    });
    responsiveData[name] = layout;
  }
  fs.writeFileSync(path.join(RESEARCH_DIR, 'responsive.json'), JSON.stringify(responsiveData, null, 2));

  console.log('\n=== RECONNAISSANCE COMPLETE ===');
  console.log(`Screenshots: ${DESIGN_DIR}/`);
  console.log(`Research data: ${RESEARCH_DIR}/`);

  await browser.close();
}

main().catch(err => {
  console.error('Recon failed:', err);
  process.exit(1);
});
