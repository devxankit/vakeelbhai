import { useCallback, useRef, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { Button, Modal, Note } from '@/components/ui'
import { errText, userApi } from '@/lib/api'
import { inr } from '@/lib/money'

/**
 * Runs the gateway step of a checkout started on the server, then asks the SERVER to verify.
 * Nothing is marked paid by this code: the server checks the gateway's signature and the
 * payment itself before changing anything.
 *
 *   razorpay: Razorpay Checkout (UPI, cards, netbanking) in a popup
 *   sandbox:  development-only stand-in window, clearly labelled, no money moves
 *
 * const { pay, dialog } = useGatewayPay(); const payment = await pay(checkout, { name, description })
 */
let rzpScript = null
function loadRazorpay() {
  rzpScript ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(window.Razorpay)
    s.onerror = () => {
      rzpScript = null
      reject(new Error('Could not load the payment window. Check your connection.'))
    }
    document.body.appendChild(s)
  })
  return rzpScript
}

const verify = (paymentId, g) => userApi('/payments/' + paymentId + '/verify', { method: 'POST', body: g }).then((j) => j.data)
const cancel = (paymentId) => userApi('/payments/' + paymentId + '/cancel', { method: 'POST' }).catch(() => {})

export function useGatewayPay() {
  const [sandbox, setSandbox] = useState(null) // { checkout, resolve, reject }
  const [busy, setBusy] = useState(false)
  const pending = useRef(null)

  const pay = useCallback(async (checkout, { name = 'Vakeel Bhai', description = '' } = {}) => {
    const { payment, gateway } = checkout
    if (!gateway) return payment // fully paid from the wallet
    if (gateway.provider === 'sandbox') {
      return new Promise((resolve, reject) => {
        pending.current = { resolve, reject }
        setSandbox(checkout)
      })
    }
    const Razorpay = await loadRazorpay()
    return new Promise((resolve, reject) => {
      const rzp = new Razorpay({
        key: gateway.keyId,
        order_id: gateway.orderId,
        amount: gateway.amount,
        currency: gateway.currency,
        name,
        description,
        theme: { color: '#0E0E0E' },
        handler: (r) => verify(payment.id, { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }).then(resolve, reject),
        modal: { ondismiss: () => (cancel(payment.id), reject(Object.assign(new Error('Payment cancelled'), { code: 'CANCELLED' }))) },
      })
      rzp.on('payment.failed', (r) => reject(new Error(r?.error?.description || 'Payment failed')))
      rzp.open()
    })
  }, [])

  const close = (outcome) => {
    const p = pending.current
    const co = sandbox
    pending.current = null
    setSandbox(null)
    if (outcome === 'cancel') {
      cancel(co.payment.id)
      p?.reject(Object.assign(new Error('Payment cancelled'), { code: 'CANCELLED' }))
    }
  }

  const sandboxPay = async () => {
    setBusy(true)
    try {
      const g = (await userApi('/payments/' + sandbox.payment.id + '/sandbox-pay', { method: 'POST' })).data
      const paid = await verify(sandbox.payment.id, g)
      const p = pending.current
      pending.current = null
      setSandbox(null)
      p?.resolve(paid)
    } catch (e) {
      const p = pending.current
      pending.current = null
      setSandbox(null)
      p?.reject(new Error(errText(e)))
    } finally {
      setBusy(false)
    }
  }

  const dialog = sandbox ? (
    <Modal
      open
      onClose={() => close('cancel')}
      title="Test payment (development)"
      footer={
        <>
          <Button variant="line" onClick={() => close('cancel')} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={sandboxPay} loading={busy}>
            Pay {inr(sandbox.gateway.amount / 100)}
          </Button>
        </>
      }>
      <Note tone="orange" icon={FlaskConical}>
        Sandbox gateway for development: no money moves. In production this is the Razorpay payment window (UPI, cards, netbanking).
      </Note>
      <p className="text-[14px] text-text-2">The server still verifies this payment exactly as it would a real one.</p>
    </Modal>
  ) : null

  return { pay, dialog }
}
