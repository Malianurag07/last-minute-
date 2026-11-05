/**
 * Business rules for money. All amounts are whole rupees and are computed
 * on the server only — the app can display them but never sets them.
 */
export const PRICING = {
  /** platform commission on the service price, kept from the provider payout */
  commissionRate: 0.12,
  /** first 3 months for a new provider: lower commission to help them start */
  launchCommissionRate: 0.05,
  launchMonths: 3,
  /** share of the rush fee the platform keeps (rest goes to the provider) */
  rushShare: 0.2,
  /** flat convenience fee paid by the customer per order */
  platformFee: 9,
  /** deadline closer than this counts as a rush order */
  rushWindowMinutes: 180,
} as const;

export function quote(opts: { price: number; rushFee: number; minutesUntilDue: number; deliveryFee: number; providerAgeDays: number }) {
  const rush = opts.minutesUntilDue <= PRICING.rushWindowMinutes ? opts.rushFee : 0;
  const rate = opts.providerAgeDays < PRICING.launchMonths * 30 ? PRICING.launchCommissionRate : PRICING.commissionRate;
  const commission = Math.round(opts.price * rate + rush * PRICING.rushShare);
  return {
    price: opts.price,
    rushFee: rush,
    deliveryFee: opts.deliveryFee,
    platformFee: PRICING.platformFee,
    customerTotal: opts.price + rush + PRICING.platformFee + opts.deliveryFee,
    commission,
    providerPayout: opts.price + rush - commission,
  };
}
