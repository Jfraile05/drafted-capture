// Card fields on checkout pages usually live in an iframe served by the payment
// provider. Sidekick can't read inside those frames, so the whole frame is
// masked in screenshots instead.

const PAYMENT_FRAME_HOSTS = [
  'stripe.com',
  'stripe.network',
  'braintreegateway.com',
  'braintree-api.com',
  'adyen.com',
  'squareup.com',
  'squarecdn.com',
  'checkout.com',
  'paypal.com',
  'paypalobjects.com',
  'recurly.com',
  'chargebee.com',
  'authorize.net',
  'spreedly.com',
  'paddle.com',
  'klarna.com',
  'affirm.com',
  'pay.google.com',
];
const PAYMENT_FRAME_LABEL = /card|payment|cvv|cvc|security code|expir|hosted.?field/i;

export function isSensitiveFrame(frame: { src?: string; title?: string; name?: string }): boolean {
  if (PAYMENT_FRAME_LABEL.test(`${frame.title ?? ''} ${frame.name ?? ''}`)) return true;
  try {
    const host = new URL(frame.src ?? '').hostname.toLowerCase();
    return PAYMENT_FRAME_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
