import geoip from 'geoip-lite';
import { UAParser } from 'ua-parser-js';

/**
 * Checks whether an IP address is a private, loopback, or local address.
 */
export function isPrivateOrLocalIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const cleanIp = ip.trim();
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost' || cleanIp === '::ffff:127.0.0.1') return true;
  if (cleanIp.startsWith('10.') || cleanIp.startsWith('192.168.') || cleanIp.startsWith('fc00:') || cleanIp.startsWith('fe80:')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp)) return true;
  return false;
}

/**
 * Robustly extracts the true client IP from incoming request headers,
 * safely resolving through multiple reverse proxies (Vercel, Cloudflare, Render).
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
export function getClientIp(req) {
  if (!req) return '127.0.0.1';

  // 1. Cloudflare connecting IP (authoritative when behind Cloudflare)
  const cfIp = req.headers?.['cf-connecting-ip'];
  if (cfIp && typeof cfIp === 'string' && !isPrivateOrLocalIp(cfIp.trim())) {
    return cfIp.trim();
  }

  // 2. Nginx / Vercel X-Real-IP
  const realIp = req.headers?.['x-real-ip'];
  if (realIp && typeof realIp === 'string' && !isPrivateOrLocalIp(realIp.trim())) {
    return realIp.trim();
  }

  // 3. X-Forwarded-For: Scan from left to right for the first public client IP
  const xForwardedFor = req.headers?.['x-forwarded-for'];
  if (xForwardedFor && typeof xForwardedFor === 'string') {
    const ips = xForwardedFor.split(',').map((s) => s.trim()).filter(Boolean);
    for (const ip of ips) {
      if (!isPrivateOrLocalIp(ip)) {
        return ip;
      }
    }
    if (ips.length > 0) return ips[0];
  }

  // 4. Express req.ip or socket fallback
  const rawIp = req.ip || req.socket?.remoteAddress;
  if (rawIp) {
    const cleaned = rawIp.replace(/^::ffff:/, '');
    return cleaned;
  }

  return '127.0.0.1';
}

/**
 * Derives approximate geographic location from IP address and edge reverse-proxy headers.
 * Privacy-preserving: Prioritizes edge headers from Vercel/Cloudflare, fallbacks to offline GeoIP database.
 *
 * @param {string} ip
 * @param {Record<string, string | string[]>} [headers]
 * @returns {{ city: string, region: string, country: string, timezone: string, source?: string }}
 */
export function getApproximateLocation(ip, headers = {}) {
  // Step 1: Check edge headers forwarded by Vercel or Cloudflare
  const vercelCity = headers['x-vercel-ip-city']
    ? decodeURIComponent(Array.isArray(headers['x-vercel-ip-city']) ? headers['x-vercel-ip-city'][0] : headers['x-vercel-ip-city'])
    : null;
  const vercelRegion = headers['x-vercel-ip-country-region']
    ? (Array.isArray(headers['x-vercel-ip-country-region']) ? headers['x-vercel-ip-country-region'][0] : headers['x-vercel-ip-country-region'])
    : null;
  const vercelCountry = headers['x-vercel-ip-country']
    ? (Array.isArray(headers['x-vercel-ip-country']) ? headers['x-vercel-ip-country'][0] : headers['x-vercel-ip-country'])
    : null;
  const vercelTimezone = headers['x-vercel-ip-timezone']
    ? (Array.isArray(headers['x-vercel-ip-timezone']) ? headers['x-vercel-ip-timezone'][0] : headers['x-vercel-ip-timezone'])
    : null;

  const cfCity = headers['cf-ipcity']
    ? decodeURIComponent(Array.isArray(headers['cf-ipcity']) ? headers['cf-ipcity'][0] : headers['cf-ipcity'])
    : null;
  const cfRegion = headers['cf-region']
    ? (Array.isArray(headers['cf-region']) ? headers['cf-region'][0] : headers['cf-region'])
    : null;
  const cfCountry = headers['cf-ipcountry']
    ? (Array.isArray(headers['cf-ipcountry']) ? headers['cf-ipcountry'][0] : headers['cf-ipcountry'])
    : null;
  const cfTimezone = headers['cf-timezone']
    ? (Array.isArray(headers['cf-timezone']) ? headers['cf-timezone'][0] : headers['cf-timezone'])
    : null;

  const clientTimezone = headers['x-client-timezone']
    ? (Array.isArray(headers['x-client-timezone']) ? headers['x-client-timezone'][0] : headers['x-client-timezone'])
    : null;

  const city = vercelCity || cfCity;
  const region = vercelRegion || cfRegion;
  const country = vercelCountry || cfCountry;
  const timezone = vercelTimezone || cfTimezone || clientTimezone || 'UTC';

  if (city || country) {
    return {
      city: city || 'Unknown City',
      region: region || 'Unknown Region',
      country: country || 'Unknown Country',
      timezone: timezone || 'UTC',
      source: 'edge-headers'
    };
  }

  // Step 2: Fallback to GeoIP on the IP address
  if (!ip || isPrivateOrLocalIp(ip)) {
    return {
      city: 'Local / Private Network',
      region: 'Unknown',
      country: 'Unknown',
      timezone: timezone || 'UTC'
    };
  }

  try {
    const geo = geoip.lookup(ip);
    if (!geo) {
      return {
        city: 'Unknown',
        region: 'Unknown',
        country: 'Unknown',
        timezone: timezone || 'UTC'
      };
    }

    return {
      city: geo.city || 'Unknown',
      region: geo.region || 'Unknown',
      country: geo.country || 'Unknown',
      timezone: geo.timezone || timezone || 'UTC',
      source: 'geoip-database'
    };
  } catch {
    return {
      city: 'Unknown',
      region: 'Unknown',
      country: 'Unknown',
      timezone: timezone || 'UTC'
    };
  }
}

/**
 * Common smartphone model dictionaries for friendly model identification.
 */
const SAMSUNG_MODELS = {
  'SM-S928': 'Samsung Galaxy S24 Ultra',
  'SM-S926': 'Samsung Galaxy S24+',
  'SM-S921': 'Samsung Galaxy S24',
  'SM-S721': 'Samsung Galaxy S24 FE',
  'SM-S918': 'Samsung Galaxy S23 Ultra',
  'SM-S916': 'Samsung Galaxy S23+',
  'SM-S911': 'Samsung Galaxy S23',
  'SM-S711': 'Samsung Galaxy S23 FE',
  'SM-S908': 'Samsung Galaxy S22 Ultra',
  'SM-S906': 'Samsung Galaxy S22+',
  'SM-S901': 'Samsung Galaxy S22',
  'SM-G998': 'Samsung Galaxy S21 Ultra',
  'SM-G996': 'Samsung Galaxy S21+',
  'SM-G991': 'Samsung Galaxy S21',
  'SM-G988': 'Samsung Galaxy S20 Ultra',
  'SM-F956': 'Samsung Galaxy Z Fold 6',
  'SM-F741': 'Samsung Galaxy Z Flip 6',
  'SM-F946': 'Samsung Galaxy Z Fold 5',
  'SM-F731': 'Samsung Galaxy Z Flip 5',
  'SM-F936': 'Samsung Galaxy Z Fold 4',
  'SM-F721': 'Samsung Galaxy Z Flip 4',
  'SM-F926': 'Samsung Galaxy Z Fold 3',
  'SM-F711': 'Samsung Galaxy Z Flip 3',
  'SM-N986': 'Samsung Galaxy Note 20 Ultra',
  'SM-A556': 'Samsung Galaxy A55 5G',
  'SM-A546': 'Samsung Galaxy A54 5G',
  'SM-A536': 'Samsung Galaxy A53 5G',
  'SM-A356': 'Samsung Galaxy A35 5G',
  'SM-A346': 'Samsung Galaxy A34 5G',
  'SM-A156': 'Samsung Galaxy A15 5G',
  'SM-A146': 'Samsung Galaxy A14 5G',
  'SM-A528': 'Samsung Galaxy A52s 5G',
  'SM-M346': 'Samsung Galaxy M34 5G',
  'SM-M546': 'Samsung Galaxy M54 5G'
};

const ONEPLUS_MODELS = {
  'CPH2581': 'OnePlus 12',
  'CPH2573': 'OnePlus 12',
  'CPH2609': 'OnePlus 12R',
  'CPH2611': 'OnePlus 12R',
  'CPH2451': 'OnePlus 11',
  'CPH2449': 'OnePlus 11 5G',
  'CPH2487': 'OnePlus 11R',
  'NE2210': 'OnePlus 10 Pro',
  'NE2213': 'OnePlus 10 Pro',
  'CPH2415': 'OnePlus 10T',
  'CPH2493': 'OnePlus Nord 3',
  'CPH2613': 'OnePlus Nord CE 4',
  'CPH2551': 'OnePlus Open',
  'IN2020': 'OnePlus 8 Pro',
  'IN2023': 'OnePlus 8 Pro'
};

const XIAOMI_MODELS = {
  '23127PN0CG': 'Xiaomi 14',
  '24030PN60G': 'Xiaomi 14 Ultra',
  '2210132G': 'Xiaomi 13 Pro',
  '2201123G': 'Xiaomi 12',
  '2201116TI': 'Xiaomi 11i 5G',
  '24053PY09G': 'POCO F6',
  '23049PCD8G': 'POCO F5',
  '2311DRK48G': 'POCO X6 Pro 5G',
  '2311DRK48I': 'POCO X6 Pro 5G',
  '2201117PG': 'POCO X4 Pro 5G',
  '22041216G': 'POCO X4 GT',
  '23076RN4BI': 'Redmi 12 5G',
  '2312DRA50G': 'Redmi Note 13 Pro+ 5G',
  '2312CRAD3C': 'Redmi Note 13 5G',
  '22101316G': 'Redmi Note 12 Pro+ 5G'
};

const VIVO_IQOO_MODELS = {
  'V2303': 'Vivo X100 Pro',
  'V2303A': 'Vivo X100 Pro',
  'V2324A': 'Vivo X Fold 3 Pro',
  'V2302A': 'Vivo V30 Pro',
  'V2318': 'Vivo V30',
  'I2220': 'iQOO 12 5G',
  'I2207': 'iQOO Neo 9 Pro',
  'I2202': 'iQOO 11 5G',
  'I2018': 'iQOO 7'
};

const REALME_MODELS = {
  'RMX3850': 'Realme GT 6',
  'RMX3851': 'Realme GT Neo 6',
  'RMX3840': 'Realme 12 Pro+ 5G',
  'RMX3706': 'Realme GT Neo 5',
  'RMX3360': 'Realme GT Master Edition'
};

const MOTOROLA_MODELS = {
  'XT2343': 'Motorola Moto G84 5G',
  'XT2401': 'Motorola Edge 50 Pro',
  'XT2403': 'Motorola Edge 50 Ultra',
  'XT2301': 'Motorola Edge 40 Pro'
};

const NOTHING_MODELS = {
  'A063': 'Nothing Phone (1)',
  'A065': 'Nothing Phone (2)',
  'A142': 'Nothing Phone (2a)',
  'A142P': 'Nothing Phone (2a) Plus',
  'A015': 'CMF Phone 1 by Nothing'
};

export const COUNTRY_NAMES = {
  IN: 'India',
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  SG: 'Singapore',
  AE: 'United Arab Emirates',
  JP: 'Japan',
  NL: 'Netherlands',
  IE: 'Ireland',
  SE: 'Sweden',
  CH: 'Switzerland'
};

export const REGION_NAMES = {
  // India
  WB: 'West Bengal',
  MH: 'Maharashtra',
  KA: 'Karnataka',
  DL: 'Delhi NCR',
  TN: 'Tamil Nadu',
  TG: 'Telangana',
  TS: 'Telangana',
  AP: 'Andhra Pradesh',
  GJ: 'Gujarat',
  UP: 'Uttar Pradesh',
  RJ: 'Rajasthan',
  KL: 'Kerala',
  MP: 'Madhya Pradesh',
  PB: 'Punjab',
  HR: 'Haryana',
  BR: 'Bihar',
  OD: 'Odisha',
  OR: 'Odisha',
  AS: 'Assam',
  GA: 'Goa',
  JK: 'Jammu and Kashmir',
  CH: 'Chandigarh',
  UT: 'Uttarakhand',
  JH: 'Jharkhand',
  CT: 'Chhattisgarh',
  // US
  CA: 'California',
  NY: 'New York',
  TX: 'Texas',
  WA: 'Washington',
  MA: 'Massachusetts',
  IL: 'Illinois',
  FL: 'Florida',
  VA: 'Virginia',
  GA: 'Georgia',
  CO: 'Colorado'
};

/**
 * Formats structured location info into a clean, human-readable display string.
 * e.g. "Kolkata, West Bengal, India (Asia/Kolkata)"
 */
export function formatLocationDisplay(location) {
  if (!location) return 'Unknown location';
  const countryName = COUNTRY_NAMES[location.country] || location.country;
  const regionName = REGION_NAMES[location.region] || location.region;
  const parts = [];
  if (location.city && location.city !== 'Unknown' && location.city !== 'Unknown City') {
    parts.push(location.city);
  }
  if (regionName && regionName !== 'Unknown' && regionName !== 'Unknown Region' && regionName !== parts[0]) {
    parts.push(regionName);
  }
  if (countryName && countryName !== 'Unknown' && countryName !== 'Unknown Country') {
    parts.push(countryName);
  }
  let str = parts.length > 0 ? parts.join(', ') : 'Unknown location';
  if (location.timezone && location.timezone !== 'UTC') {
    str += ` (${location.timezone})`;
  }
  return str;
}

/**
 * Resolves a friendly smartphone name from a raw model code and vendor.
 */
function resolveFriendlyPhoneModel(rawModel, rawVendor) {
  if (!rawModel) return '';
  const cleanModel = rawModel.trim().replace(/^["']|["']$/g, '');

  for (const [prefix, name] of Object.entries(SAMSUNG_MODELS)) {
    if (cleanModel.includes(prefix)) return name;
  }
  for (const [prefix, name] of Object.entries(ONEPLUS_MODELS)) {
    if (cleanModel.includes(prefix)) return name;
  }
  for (const [prefix, name] of Object.entries(XIAOMI_MODELS)) {
    if (cleanModel.includes(prefix)) return name;
  }
  for (const [prefix, name] of Object.entries(VIVO_IQOO_MODELS)) {
    if (cleanModel.includes(prefix)) return name;
  }
  for (const [prefix, name] of Object.entries(REALME_MODELS)) {
    if (cleanModel.includes(prefix)) return name;
  }
  for (const [prefix, name] of Object.entries(MOTOROLA_MODELS)) {
    if (cleanModel.includes(prefix)) return name;
  }
  for (const [prefix, name] of Object.entries(NOTHING_MODELS)) {
    if (cleanModel.includes(prefix)) return name;
  }

  if (/Pixel\s*[0-9]+[a-z]?(\s*Pro(\s*XL)?)?/i.test(cleanModel)) {
    return cleanModel.startsWith('Google ') ? cleanModel : `Google ${cleanModel}`;
  }

  if (cleanModel === 'iPhone' || cleanModel === 'iPad') {
    return `Apple ${cleanModel}`;
  }

  if (rawVendor && rawVendor !== 'Unknown' && !cleanModel.toLowerCase().startsWith(rawVendor.toLowerCase())) {
    return `${rawVendor} ${cleanModel}`;
  }

  return cleanModel;
}

/**
 * Parses user agent string and Client Hints headers to identify the exact
 * device model (including smartphone model), operating system, and browser.
 *
 * @param {string} userAgent
 * @param {Record<string, string | string[]>} [headers]
 * @returns {{ browser: string, browserVersion: string, os: string, deviceType: string, phoneModel: string, vendor: string, summary: string }}
 */
export function parseUserAgent(userAgent, headers = {}) {
  if (!userAgent || typeof userAgent !== 'string') {
    return {
      browser: 'Unknown Browser',
      browserVersion: '',
      os: 'Unknown OS',
      deviceType: 'Desktop',
      phoneModel: '',
      vendor: '',
      summary: 'Unknown Device'
    };
  }

  try {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    let browser = result.browser.name || 'Unknown Browser';
    let browserVersion = result.browser.version ? result.browser.version.split('.')[0] : '';
    let os = result.os.name ? `${result.os.name}${result.os.version ? ' ' + result.os.version : ''}` : 'Unknown OS';
    let deviceType = result.device.type ? result.device.type.charAt(0).toUpperCase() + result.device.type.slice(1) : 'Desktop';
    let vendor = result.device.vendor || '';
    let model = result.device.model || '';

    // Check Sec-CH-UA client hints from headers
    const chModel = headers['sec-ch-ua-model']
      ? (Array.isArray(headers['sec-ch-ua-model']) ? headers['sec-ch-ua-model'][0] : headers['sec-ch-ua-model']).replace(/^["']|["']$/g, '').trim()
      : '';
    const chPlatform = headers['sec-ch-ua-platform']
      ? (Array.isArray(headers['sec-ch-ua-platform']) ? headers['sec-ch-ua-platform'][0] : headers['sec-ch-ua-platform']).replace(/^["']|["']$/g, '').trim()
      : '';
    const chPlatformVersion = headers['sec-ch-ua-platform-version']
      ? (Array.isArray(headers['sec-ch-ua-platform-version']) ? headers['sec-ch-ua-platform-version'][0] : headers['sec-ch-ua-platform-version']).replace(/^["']|["']$/g, '').trim()
      : '';

    if (chModel && !model) {
      model = chModel;
    }

    // Windows 11 vs Windows 10 detection
    if (userAgent.includes('Windows NT 10.0')) {
      if (chPlatformVersion && parseInt(chPlatformVersion.split('.')[0], 10) >= 13) {
        os = 'Windows 11';
      } else {
        os = 'Windows 10 / 11';
      }
    } else if (userAgent.includes('Windows NT 6.3')) {
      os = 'Windows 8.1';
    } else if (userAgent.includes('Windows NT 6.1')) {
      os = 'Windows 7';
    }

    // Detailed iOS detection
    const iosMatch = userAgent.match(/CPU\s+(?:iPhone\s+)?OS\s+([0-9_]+)\s+like\s+Mac\s+OS\s+X/i);
    if (iosMatch) {
      const iosVersion = iosMatch[1].replace(/_/g, '.');
      os = `iOS ${iosVersion}`;
      if (!model) model = userAgent.includes('iPad') ? 'iPad' : 'iPhone';
      vendor = 'Apple';
      deviceType = userAgent.includes('iPad') ? 'Tablet' : 'Mobile';
    }

    // Detailed Android smartphone extraction
    const androidMatch = userAgent.match(/Android\s+([0-9.]+)(?:;\s*([^;)]+?))?(?:\s+Build|\))/i);
    if (androidMatch) {
      const androidVer = androidMatch[1];
      if (!os.includes(androidVer)) {
        os = `Android ${androidVer}`;
      }
      deviceType = 'Mobile';
      if (!model && androidMatch[2]) {
        model = androidMatch[2].trim();
      }
    }

    // Enhanced phone model resolution
    const phoneModel = resolveFriendlyPhoneModel(model || chModel, vendor);

    // Compute device display summary
    let summary = '';
    if (phoneModel) {
      summary = `${phoneModel} (${os}) • ${browser} ${browserVersion}`.trim();
    } else if (deviceType === 'Mobile' || deviceType === 'Tablet') {
      summary = `${deviceType} (${os}) • ${browser} ${browserVersion}`.trim();
    } else if (os.includes('Windows')) {
      summary = `${os} PC • ${browser} ${browserVersion}`.trim();
    } else if (os.includes('Mac OS') || userAgent.includes('Macintosh')) {
      summary = `Apple Mac (${os}) • ${browser} ${browserVersion}`.trim();
    } else {
      summary = `${os} • ${browser} ${browserVersion}`.trim();
    }

    return {
      browser,
      browserVersion,
      os,
      deviceType,
      phoneModel,
      vendor,
      summary
    };
  } catch {
    return {
      browser: 'Unknown Browser',
      browserVersion: '',
      os: 'Unknown OS',
      deviceType: 'Desktop',
      phoneModel: '',
      vendor: '',
      summary: 'Unknown Device'
    };
  }
}
