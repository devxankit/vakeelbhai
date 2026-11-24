import { advocatePayout, clientBill, inr, membershipTotal, offerDiscount } from '../src/utils/money';

describe('money rules (SCOPE-OF-WORK section 5)', () => {
  test('offer discount is capped', () => {
    expect(offerDiscount(5000, { percent: 10, max: 500 })).toBe(500);
    expect(offerDiscount(8000, { percent: 10, max: 500 })).toBe(500);
    expect(offerDiscount(3000, { percent: 10, max: 500 })).toBe(300);
    expect(offerDiscount(200, { flat: 500 })).toBe(200);
    expect(offerDiscount(1000)).toBe(0);
  });

  test('client bill: GST after discount, then wallet', () => {
    const b = clientBill(5000, { discount: 500, wallet: 150 });
    expect(b.base).toBe(4500);
    expect(b.gst).toBe(810);
    expect(b.total).toBe(5160);
  });

  test('client bill without GST on the service', () => {
    expect(clientBill(1000, { gstOnService: false }).total).toBe(1000);
  });

  test('wallet never exceeds the bill', () => {
    expect(clientBill(100, { gstOnService: false, wallet: 500 }).total).toBe(0);
  });

  test('advocate payout: 20% commission plus 18% GST on it', () => {
    const p = advocatePayout(4500);
    expect(p.commission).toBe(900);
    expect(p.gstOnCommission).toBe(162);
    expect(p.net).toBe(3438);
  });

  test('custom commission rate from admin', () => {
    expect(advocatePayout(10000, { commission: 0.15, gst: 0.18 }).net).toBe(8230);
  });

  test('membership GST', () => {
    expect(membershipTotal(1000).total).toBe(1180);
  });

  test('Indian rupee format', () => {
    expect(inr(214860)).toBe('₹2,14,860');
    expect(inr(5160)).toBe('₹5,160');
    expect(inr(999)).toBe('₹999');
    expect(inr(-20000)).toBe('−₹20,000');
    expect(inr(10.5)).toBe('₹10.50');
  });
});
