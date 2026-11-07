const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '../node_modules/@playwright/test'));

const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Create favicon.svg with prefers-color-scheme support
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <style>
      :root {
        --bg-color: #09090b;
        --fg-color: #ffffff;
        --star-color: #ffffff;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg-color: #ffffff;
          --fg-color: #09090b;
          --star-color: #09090b;
        }
      }
    </style>
  </defs>
  <!-- Background Badge -->
  <rect width="512" height="512" rx="112" fill="var(--bg-color)" />
  <!-- Monogram E -->
  <path d="M 120 144 C 120 126 134 112 152 112 L 356 112 C 372 112 384 124 384 140 C 384 156 372 168 356 168 L 180 168 L 180 226 L 288 226 C 304 226 316 238 316 254 C 316 270 304 282 288 282 L 180 282 L 180 344 L 356 344 C 372 344 384 356 384 372 C 384 388 372 400 356 400 L 152 400 C 134 400 120 386 120 368 Z" fill="var(--fg-color)" />
  <!-- Radiant Discovery Beacon (Star) -->
  <path d="M 364 200 Q 364 254 310 254 Q 364 254 364 308 Q 364 254 418 254 Q 364 254 364 200 Z" fill="var(--star-color)" />
</svg>`;

fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent, 'utf8');
console.log('✓ Created client/public/favicon.svg');

// 2. Create site.webmanifest
const webmanifest = {
  name: "Eventora – Discover Events & Book Your Next Experience",
  short_name: "Eventora",
  description: "Production-grade event discovery and RSVP management platform.",
  start_url: "/",
  display: "standalone",
  background_color: "#09090b",
  theme_color: "#09090b",
  icons: [
    {
      src: "/icon.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable"
    },
    {
      src: "/apple-icon.png",
      sizes: "180x180",
      type: "image/png"
    }
  ]
};

fs.writeFileSync(
  path.join(publicDir, 'site.webmanifest'),
  JSON.stringify(webmanifest, null, 2),
  'utf8'
);
console.log('✓ Created client/public/site.webmanifest');

// Helper to create multi-image ICO
function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = 1 (icon)
  header.writeUInt16LE(images.length, 4); // count

  const dirSize = 16 * images.length;
  let offset = 6 + dirSize;

  const entries = [];
  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.width === 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height === 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(img.buffer.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    entries.push(entry);
    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((img) => img.buffer)]);
}

// 3. Render PNG and ICO assets using Playwright Chromium
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // HTML template for rendering brand icon badge (dark background, white glyph)
  const iconHtml = (size) => `<!DOCTYPE html>
  <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: ${size}px;
          height: ${size}px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
        }
        svg {
          width: 100%;
          height: 100%;
        }
      </style>
    </head>
    <body>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
        <rect width="512" height="512" rx="112" fill="#09090b" />
        <path d="M 120 144 C 120 126 134 112 152 112 L 356 112 C 372 112 384 124 384 140 C 384 156 372 168 356 168 L 180 168 L 180 226 L 288 226 C 304 226 316 238 316 254 C 316 270 304 282 288 282 L 180 282 L 180 344 L 356 344 C 372 344 384 356 384 372 C 384 388 372 400 356 400 L 152 400 C 134 400 120 386 120 368 Z" fill="#ffffff" />
        <path d="M 364 200 Q 364 254 310 254 Q 364 254 364 308 Q 364 254 418 254 Q 364 254 364 200 Z" fill="#ffffff" />
      </svg>
    </body>
  </html>`;

  // Render 512x512 icon.png
  await page.setViewportSize({ width: 512, height: 512 });
  await page.setContent(iconHtml(512));
  const icon512Buffer = await page.screenshot({ type: 'png', omitBackground: true });
  fs.writeFileSync(path.join(publicDir, 'icon.png'), icon512Buffer);
  console.log('✓ Created client/public/icon.png (512x512)');

  // Render 180x180 apple-icon.png
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(iconHtml(180));
  const appleIconBuffer = await page.screenshot({ type: 'png', omitBackground: true });
  fs.writeFileSync(path.join(publicDir, 'apple-icon.png'), appleIconBuffer);
  console.log('✓ Created client/public/apple-icon.png (180x180)');

  // Render 16, 32, 48 for ICO
  await page.setViewportSize({ width: 16, height: 16 });
  await page.setContent(iconHtml(16));
  const icon16Buffer = await page.screenshot({ type: 'png', omitBackground: true });

  await page.setViewportSize({ width: 32, height: 32 });
  await page.setContent(iconHtml(32));
  const icon32Buffer = await page.screenshot({ type: 'png', omitBackground: true });

  await page.setViewportSize({ width: 48, height: 48 });
  await page.setContent(iconHtml(48));
  const icon48Buffer = await page.screenshot({ type: 'png', omitBackground: true });

  const icoBuffer = createIco([
    { width: 16, height: 16, buffer: icon16Buffer },
    { width: 32, height: 32, buffer: icon32Buffer },
    { width: 48, height: 48, buffer: icon48Buffer },
  ]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log('✓ Created client/public/favicon.ico (multi-resolution 16/32/48 ICO)');

  // Render 1200x630 og-image.png
  const ogHtml = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 1200px;
          height: 630px;
          background: #09090b;
          color: #fafafa;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 80px 96px;
        }

        /* Ambient background glow */
        .glow-1 {
          position: absolute;
          width: 600px;
          height: 600px;
          top: -150px;
          right: -100px;
          background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(9,9,11,0) 70%);
          border-radius: 50%;
          pointer-events: none;
        }

        .glow-2 {
          position: absolute;
          width: 500px;
          height: 500px;
          bottom: -150px;
          left: 100px;
          background: radial-gradient(circle, rgba(255,255,255,0.04) 0%, rgba(9,9,11,0) 70%);
          border-radius: 50%;
          pointer-events: none;
        }

        .grid-pattern {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }

        /* Content Layout */
        .content {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 100%;
        }

        .left-col {
          max-width: 650px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .brand-pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #a1a1aa;
          width: fit-content;
        }

        .brand-pill .dot {
          width: 8px;
          height: 8px;
          background: #10b981;
          border-radius: 50%;
          box-shadow: 0 0 8px #10b981;
        }

        h1 {
          font-size: 64px;
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1.05;
          color: #ffffff;
        }

        p.tagline {
          font-size: 24px;
          font-weight: 400;
          line-height: 1.4;
          color: #a1a1aa;
        }

        .feature-pills {
          display: flex;
          gap: 12px;
          margin-top: 8px;
        }

        .feature-pill {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 14px;
          font-weight: 500;
          color: #e4e4e7;
        }

        /* Right column: Icon badge */
        .right-col {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .icon-badge {
          width: 280px;
          height: 280px;
          background: #121215;
          border: 2px solid rgba(255, 255, 255, 0.15);
          border-radius: 64px;
          box-shadow: 
            0 25px 50px -12px rgba(0, 0, 0, 0.7),
            0 0 40px rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px;
        }

        .icon-badge svg {
          width: 100%;
          height: 100%;
        }

        .footer {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 24px;
          font-size: 15px;
          color: #71717a;
        }

        .domain {
          font-weight: 600;
          color: #ffffff;
          letter-spacing: -0.01em;
        }
      </style>
    </head>
    <body>
      <div class="glow-1"></div>
      <div class="glow-2"></div>
      <div class="grid-pattern"></div>

      <div class="content">
        <div class="left-col">
          <div class="brand-pill">
            <span class="dot"></span>
            Event Management &amp; RSVP Platform
          </div>
          <h1>Eventora</h1>
          <p class="tagline">
            Discover Events &amp; Book Your Next Experience with atomic seat reservations and real-time RSVPs.
          </p>
          <div class="feature-pills">
            <div class="feature-pill">✦ Atomic Reservations</div>
            <div class="feature-pill">✦ Real-Time RSVPs</div>
            <div class="feature-pill">✦ Clean Architecture</div>
          </div>
        </div>

        <div class="right-col">
          <div class="icon-badge">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
              <rect width="512" height="512" rx="96" fill="#09090b" />
              <path d="M 120 144 C 120 126 134 112 152 112 L 356 112 C 372 112 384 124 384 140 C 384 156 372 168 356 168 L 180 168 L 180 226 L 288 226 C 304 226 316 238 316 254 C 316 270 304 282 288 282 L 180 282 L 180 344 L 356 344 C 372 344 384 356 384 372 C 384 388 372 400 356 400 L 152 400 C 134 400 120 386 120 368 Z" fill="#ffffff" />
              <path d="M 364 200 Q 364 254 310 254 Q 364 254 364 308 Q 364 254 418 254 Q 364 254 364 200 Z" fill="#ffffff" />
            </svg>
          </div>
        </div>
      </div>

      <div class="footer">
        <span class="domain">eventora.com</span>
        <span>Secure • Production-Grade • Next.js App Router</span>
      </div>
    </body>
  </html>`;

  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(ogHtml);
  const ogBuffer = await page.screenshot({ type: 'png' });
  fs.writeFileSync(path.join(publicDir, 'og-image.png'), ogBuffer);
  console.log('✓ Created client/public/og-image.png (1200x630)');

  await browser.close();
  console.log('★ All favicon and brand assets generated successfully!');
})();
