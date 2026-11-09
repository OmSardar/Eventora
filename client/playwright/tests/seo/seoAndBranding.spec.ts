import { test, expect } from "@playwright/test";

test.describe("SEO, Metadata & Brand Icon Verification", () => {
  test("Homepage contains complete metadata, canonicals, OG tags, and JSON-LD", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Title & Description
    await expect(page).toHaveTitle(
      "Eventora – Discover Events & Book Your Next Experience"
    );
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute(
      "content",
      /Discover upcoming technology conferences/
    );

    // 2. Canonical URL
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", /https?:\/\/[^\/]+(\/)?$/);

    // 3. OpenGraph tags
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Eventora – Discover Events & Book Your Next Experience"
    );
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      "content",
      "website"
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /\/og-image\.png/
    );

    // 4. Twitter Card
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image"
    );

    // 5. Favicon and Manifest Links
    const faviconSvg = page.locator('link[rel="icon"][type="image/svg+xml"]');
    await expect(faviconSvg).toHaveAttribute("href", "/favicon.svg");

    const appleIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleIcon).toHaveAttribute("href", "/apple-icon.png");

    const manifest = page.locator('link[rel="manifest"]');
    await expect(manifest).toHaveAttribute("href", "/site.webmanifest");

    // 6. JSON-LD Structured Data
    const scripts = await page.locator('script[type="application/ld+json"]').all();
    expect(scripts.length).toBeGreaterThanOrEqual(1);

    const schemas = [];
    for (const s of scripts) {
      const text = await s.textContent();
      if (text) {
        schemas.push(JSON.parse(text));
      }
    }

    const websiteSchema = schemas.find((s) => s["@type"] === "WebSite");
    expect(websiteSchema).toBeDefined();
    expect(websiteSchema.name).toBe("Eventora");
    expect(websiteSchema.potentialAction?.["@type"]).toBe("SearchAction");

    const orgSchema = schemas.find((s) => s["@type"] === "Organization");
    expect(orgSchema).toBeDefined();
    expect(orgSchema.name).toBe("Eventora");
    expect(orgSchema.logo).toContain("/icon.png");
  });

  test("Events listing page contains appropriate title, canonical, and social tags", async ({
    page,
  }) => {
    await page.goto("/events");

    await expect(page).toHaveTitle("Discover Upcoming Events | Eventora");
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute(
      "href",
      /https?:\/\/[^\/]+\/events/
    );

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Discover Upcoming Events | Eventora"
    );
  });

  test("Authentication and private dashboard routes enforce noindex, nofollow", async ({
    page,
  }) => {
    // 1. /login
    await page.goto("/login");
    await expect(page).toHaveTitle("Sign In | Eventora");
    const loginRobots = page.locator('meta[name="robots"]');
    await expect(loginRobots).toHaveAttribute("content", /noindex/);
    await expect(loginRobots).toHaveAttribute("content", /nofollow/);

    // 2. /register
    await page.goto("/register");
    await expect(page).toHaveTitle("Create an Account | Eventora");
    const registerRobots = page.locator('meta[name="robots"]');
    await expect(registerRobots).toHaveAttribute("content", /noindex/);
    await expect(registerRobots).toHaveAttribute("content", /nofollow/);

    // 3. /attendee/dashboard
    await page.goto("/attendee/dashboard");
    const attendeeRobots = page.locator('meta[name="robots"]');
    await expect(attendeeRobots).toHaveAttribute("content", /noindex/);
    await expect(attendeeRobots).toHaveAttribute("content", /nofollow/);

    // 4. /organizer/dashboard
    await page.goto("/organizer/dashboard");
    const organizerRobots = page.locator('meta[name="robots"]');
    await expect(organizerRobots).toHaveAttribute("content", /noindex/);
    await expect(organizerRobots).toHaveAttribute("content", /nofollow/);
  });

  test("Brand header logo links to homepage with accessible label", async ({
    page,
  }) => {
    await page.goto("/events");
    const brandLink = page.getByRole("banner").getByRole("link", { name: "Eventora Home" });
    await expect(brandLink).toBeVisible();
    await expect(brandLink).toHaveAttribute("href", "/");
  });

  test("Metadata routes and static brand assets return HTTP 200", async ({
    request,
  }) => {
    // Robots.txt
    const robotsRes = await request.get("/robots.txt");
    expect(robotsRes.status()).toBe(200);
    const robotsBody = await robotsRes.text();
    expect(robotsBody).toContain("User-Agent: *");
    expect(robotsBody).toContain("Disallow: /organizer");
    expect(robotsBody).toContain("Disallow: /attendee");
    expect(robotsBody).toMatch(/Sitemap:\s+https?:\/\/.+\/sitemap\.xml/);

    // Sitemap.xml
    const sitemapRes = await request.get("/sitemap.xml");
    expect(sitemapRes.status()).toBe(200);
    const sitemapBody = await sitemapRes.text();
    expect(sitemapBody).toContain("<urlset");
    expect(sitemapBody).toMatch(/<loc>https?:\/\/[^<]+<\/loc>/);
    expect(sitemapBody).toMatch(/<loc>https?:\/\/[^<]+\/events<\/loc>/);

    // Favicon & Assets
    const faviconRes = await request.get("/favicon.ico");
    expect(faviconRes.status()).toBe(200);
    const faviconBuffer = await faviconRes.body();
    expect(faviconBuffer.length).toBeGreaterThan(0);

    const svgRes = await request.get("/favicon.svg");
    expect(svgRes.status()).toBe(200);
    expect(await svgRes.text()).toContain("prefers-color-scheme");

    const iconPngRes = await request.get("/icon.png");
    expect(iconPngRes.status()).toBe(200);

    const appleIconRes = await request.get("/apple-icon.png");
    expect(appleIconRes.status()).toBe(200);

    const ogImageRes = await request.get("/og-image.png");
    expect(ogImageRes.status()).toBe(200);

    const manifestRes = await request.get("/site.webmanifest");
    expect(manifestRes.status()).toBe(200);
    const manifestJson = await manifestRes.json();
    expect(manifestJson.name).toContain("Eventora");
    expect(manifestJson.icons.length).toBeGreaterThanOrEqual(2);
  });

  test("Event detail page renders dynamic Event schema and meta without leaking attendee data", async ({
    page,
    request,
  }) => {
    // Fetch a public event from the API
    const eventsRes = await request.get("http://localhost:5000/api/v1/events?limit=1");
    const json = await eventsRes.json();
    const event = json.data?.events?.[0] || json.events?.[0];

    if (!event) {
      test.skip(true, "No seeded event found for dynamic metadata test");
      return;
    }

    await page.goto(`/events/${event._id}`);

    // Dynamic Title
    const escapedTitle = event.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(page).toHaveTitle(new RegExp(escapedTitle));

    // Dynamic Canonical
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute(
      "href",
      new RegExp(`/events/${event._id}`)
    );

    // Event JSON-LD schema
    const script = page.locator('script[type="application/ld+json"]').first();
    await expect(script).toBeAttached();
    const text = await script.textContent();
    expect(text).toBeDefined();

    const schema = JSON.parse(text!);
    expect(schema["@type"]).toBe("Event");
    expect(schema.name).toBe(event.title);
    expect(schema.location["@type"]).toBe("Place");
    expect(schema.offers["@type"]).toBe("Offer");

    // Privacy assertion: No attendee roster or email in structured data
    expect(text).not.toContain("attendee@");
    expect(text).not.toContain("attendees");
  });
});

