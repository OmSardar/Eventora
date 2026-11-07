import geoip from 'geoip-lite';
import { UAParser } from 'ua-parser-js';

/**
 * Checks whether an IP address is a private, loopback, or local address.
 */
function isPrivateOrLocalIp(ip) {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('fc00:') || ip.startsWith('fe80:')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  return false;
}

/**
 * Derives approximate geographic location from IP address using offline GeoIP database.
 * Privacy-preserving: Never uses device GPS. Fallback gracefully if unknown.
 *
 * @param {string} ip
 * @returns {{ city: string, region: string, country: string, timezone: string }}
 */
export function getApproximateLocation(ip) {
  if (!ip || isPrivateOrLocalIp(ip)) {
    return {
      city: 'Local / Private Network',
      region: 'Unknown',
      country: 'Unknown',
      timezone: 'UTC'
    };
  }

  try {
    const geo = geoip.lookup(ip);
    if (!geo) {
      return {
        city: 'Unknown',
        region: 'Unknown',
        country: 'Unknown',
        timezone: 'UTC'
      };
    }

    return {
      city: geo.city || 'Unknown',
      region: geo.region || 'Unknown',
      country: geo.country || 'Unknown',
      timezone: geo.timezone || 'UTC'
    };
  } catch {
    return {
      city: 'Unknown',
      region: 'Unknown',
      country: 'Unknown',
      timezone: 'UTC'
    };
  }
}

/**
 * Parses user agent string to identify device, operating system, and browser.
 *
 * @param {string} userAgent
 * @returns {{ browser: string, browserVersion: string, os: string, deviceType: string }}
 */
export function parseUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    return {
      browser: 'Unknown Browser',
      browserVersion: '',
      os: 'Unknown OS',
      deviceType: 'Desktop'
    };
  }

  try {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    const browser = result.browser.name || 'Unknown Browser';
    const browserVersion = result.browser.version ? result.browser.version.split('.')[0] : '';
    const os = result.os.name ? `${result.os.name}${result.os.version ? ' ' + result.os.version : ''}` : 'Unknown OS';
    const deviceType = result.device.type ? result.device.type.charAt(0).toUpperCase() + result.device.type.slice(1) : 'Desktop';

    return {
      browser,
      browserVersion,
      os,
      deviceType
    };
  } catch {
    return {
      browser: 'Unknown Browser',
      browserVersion: '',
      os: 'Unknown OS',
      deviceType: 'Desktop'
    };
  }
}

