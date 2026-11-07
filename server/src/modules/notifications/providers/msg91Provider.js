import { logger } from '../../../infrastructure/logging/logger.js';

export function normalizeIndianPhoneNumber(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return null;
}

/**
 * Sends a transactional SMS via MSG91 Flow API.
 * @param {Object} options
 * @param {string} options.mobile - Recipient phone number
 * @param {string} options.templateId - MSG91 template / flow ID
 * @param {Object} options.variables - Dynamic template replacement variables
 */
export async function sendMsg91Sms({ mobile, templateId, variables = {} }) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const normalizedNumber = normalizeIndianPhoneNumber(mobile);

  if (!normalizedNumber) {
    logger.warn({ mobile }, 'MSG91: Invalid or unsupported mobile number format. Must be a valid 10-digit Indian number.');
    return {
      success: false,
      reason: 'INVALID_PHONE_NUMBER'
    };
  }

  // If running in development/test without credentials, simulate provider delivery
  if (!authKey) {
    logger.info(
      { mobile: normalizedNumber, templateId, variables },
      'MSG91: [MOCK MODE] Transactional SMS successfully simulated (no MSG91_AUTH_KEY provided)'
    );
    return {
      success: true,
      providerRef: `msg91_mock_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    };
  }

  const baseUrl = process.env.MSG91_BASE_URL || 'https://control.msg91.com/api/v5';
  const payload = {
    template_id: templateId,
    short_url: '0',
    recipients: [
      {
        mobiles: normalizedNumber,
        ...variables
      }
    ]
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const res = await fetch(`${baseUrl}/flow/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: authKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.type === 'error') {
      logger.error({ resStatus: res.status, err: json.message || json }, 'MSG91: Provider returned error response');
      return {
        success: false,
        reason: json.message || `Provider HTTP ${res.status}`
      };
    }

    return {
      success: true,
      providerRef: json.request_id || json.message || 'DELIVERED'
    };
  } catch (err) {
    logger.error({ err: err?.message, mobile: normalizedNumber }, 'MSG91: Network or timeout error during SMS delivery');
    return {
      success: false,
      reason: err.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : (err.message || 'NETWORK_FAILURE')
    };
  }
}

