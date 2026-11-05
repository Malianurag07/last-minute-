import { config } from './config.ts';

/**
 * SMS gateway. In India, OTP SMS must use a DLT-registered sender ID and
 * template (TRAI TCCCPR 2018). Plug the chosen provider (MSG91, Gupshup,
 * Twilio India, …) in `send`. The console sender is refused in production.
 */
export async function sendSms(phone10: string, text: string) {
  if (config.smsProvider === 'console') {
    console.info(`[sms → +91${phone10.slice(0, 2)}******${phone10.slice(-2)}] ${text}`);
    return;
  }
  throw new Error(`SMS provider "${config.smsProvider}" is not configured`);
}
