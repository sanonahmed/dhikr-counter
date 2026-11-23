import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const origin = 'https://dhikr-counter1.onrender.com';
const read = (filePath) => readFileSync(filePath, 'utf8');
const files = new Map([
  ['/', read(path.join(root, 'index.html'))],
  ['/features.html', read(path.join(publicDir, 'features.html'))],
  ['/privacy.html', read(path.join(publicDir, 'privacy.html'))],
  ['/guides/digital-tasbih.html', read(path.join(publicDir, 'guides', 'digital-tasbih.html'))],
  ['/guides/daily-dhikr.html', read(path.join(publicDir, 'guides', 'daily-dhikr.html'))],
  ['/developers/sawon-ahmed.html', read(path.join(publicDir, 'developers', 'sawon-ahmed.html'))],
]);
const sitemap = read(path.join(publicDir, 'sitemap.xml'));
const robots = read(path.join(publicDir, 'robots.txt'));
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
check(sitemapUrls.length > 0, 'Sitemap contains no URLs.');
check(new Set(sitemapUrls).size === sitemapUrls.length, 'Sitemap contains duplicate URLs.');
check(sitemap.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'Sitemap is missing the standard XML sitemap namespace.');
check(robots.includes(`Sitemap: ${origin}/sitemap.xml`), 'robots.txt must point to the production sitemap.');
check(robots.includes('Disallow: /api/'), 'robots.txt should keep API endpoints out of crawler results.');

for (const [route, html] of files) {
  const label = route === '/' ? 'Homepage' : route;
  const titleMatches = [...html.matchAll(/<title>(.*?)<\/title>/isg)];
  const canonicalMatches = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?\s*>/gi)];
  const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1] ?? '';
  const headingMatches = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  const canonical = canonicalMatches[0]?.[1];

  const title = titleMatches[0]?.[1]?.trim() ?? '';
  check(titleMatches.length === 1, `${label}: expected exactly one page title.`);
  check(title.length > 0 && title.length <= 70, `${label}: page title must be non-empty and no longer than 70 characters (currently ${title.length}).`);
  check(Boolean(description.trim()), `${label}: missing meta description.`);
  check(description.length >= 60 && description.length <= 170, `${label}: meta description should be 60–170 characters (currently ${description.length}).`);
  check(headingMatches.length === 1, `${label}: expected exactly one descriptive H1 (found ${headingMatches.length}).`);
  check(Boolean(headingMatches[0]?.[1]?.replace(/<[^>]*>/g, '').trim()), `${label}: H1 must contain descriptive text.`);
  check(canonicalMatches.length === 1, `${label}: expected exactly one canonical URL.`);
  check(canonical === `${origin}${route}`, `${label}: canonical URL does not match ${origin}${route}.`);
  check(/<meta\s+name="robots"\s+content="index\s*,\s*follow/i.test(html), `${label}: missing index, follow robots directive.`);
  check(html.includes('og:title') && html.includes('og:description') && html.includes('og:image'), `${label}: missing social preview title, description, or image.`);
  check(html.includes(`property="og:url" content="${canonical}"`), `${label}: Open Graph URL must match the canonical URL.`);
  const expectedSocialImage = route === '/developers/sawon-ahmed.html' ? `${origin}/developers/sawonahmed.jpg` : `${origin}/social-preview.png`;
  check(html.includes(expectedSocialImage), `${label}: social image must use the expected production image URL.`);
  const expectedImageDimensions = route === '/developers/sawon-ahmed.html'
    ? /property="og:image:width" content="1612"/.test(html) && /property="og:image:height" content="2015"/.test(html)
    : /property="og:image:width" content="1200"/.test(html) && /property="og:image:height" content="630"/.test(html);
  check(expectedImageDimensions, `${label}: Open Graph image dimensions must match the selected production image.`);
  check(/property="og:image:alt" content="[^"]+"/.test(html), `${label}: Open Graph image must have accessible alt text.`);
  check(/name="twitter:card" content="summary_large_image"/.test(html), `${label}: missing large-image Twitter card.`);
  check(/name="twitter:title" content="[^"]+"/.test(html) && /name="twitter:description" content="[^"]+"/.test(html), `${label}: missing Twitter title or description.`);
  check(/name="twitter:image" content="https:\/\/[^\"]+"/.test(html), `${label}: missing absolute Twitter image URL.`);
  check(html.includes('application/ld+json'), `${label}: missing relevant structured data.`);

  for (const block of html.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(block[1]);
      check(Boolean(data['@context'] === 'https://schema.org' && (data['@type'] || data['@graph'])), `${label}: JSON-LD does not define a Schema.org entity.`);
    } catch (error) {
      errors.push(`${label}: invalid JSON-LD (${error instanceof Error ? error.message : String(error)}).`);
    }
  }

  const links = [...html.matchAll(/<(?:a|link)\b[^>]*\bhref="([^"]+)"/gi)].map((match) => match[1]);
  for (const href of links) {
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const pathname = href.split(/[?#]/, 1)[0];
    const assetPath = path.join(publicDir, ...pathname.split('/').filter(Boolean));
    const homepagePath = pathname === '/' ? path.join(root, 'index.html') : assetPath;
    check(existsSync(homepagePath), `${label}: internal link ${href} does not resolve to a public file.`);
  }
}

for (const url of sitemapUrls) {
  let route;
  try {
    const parsed = new URL(url);
    route = parsed.pathname;
    check(parsed.origin === origin, `Sitemap URL uses an unexpected host: ${url}.`);
  } catch {
    errors.push(`Sitemap contains an invalid URL: ${url}.`);
    continue;
  }
  const publicFile = route === '/' ? path.join(root, 'index.html') : path.join(publicDir, ...route.split('/').filter(Boolean));
  check(existsSync(publicFile), `Sitemap URL ${url} does not map to a deployable static page.`);
  const pageHtml = route === '/' ? read(path.join(root, 'index.html')) : existsSync(publicFile) ? read(publicFile) : '';
  const canonical = pageHtml.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  check(canonical === url, `Sitemap URL ${url} does not match that page's canonical URL.`);
}

for (const required of ['/features.html', '/privacy.html', '/guides/digital-tasbih.html', '/guides/daily-dhikr.html', '/developers/sawon-ahmed.html']) {
  check(sitemapUrls.includes(`${origin}${required}`), `Sitemap does not include public guide ${required}.`);
}
for (const blocked of ['/settings', '/admin', '/counter', '/api/health']) {
  check(!sitemapUrls.some((url) => new URL(url).pathname === blocked), `Private or app-only route is listed in sitemap: ${blocked}.`);
}

const socialImage = readFileSync(path.join(publicDir, 'social-preview.png'));
check(socialImage.readUInt32BE(16) === 1200 && socialImage.readUInt32BE(20) === 630, 'Social preview must be a 1200 × 630 PNG image.');
check(socialImage.toString('ascii', 1, 4) === 'PNG', 'Social preview must be a valid PNG.');
check(sitemapUrls.includes(`${origin}/`), 'Sitemap must include the production homepage.');

if (errors.length) {
  console.error('SEO checks failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`SEO checks passed: ${files.size} crawlable pages, matching canonicals and sitemap, valid structured data, share image, and resolving internal links.`);
}
