import crypto from 'node:crypto'

/**
 * DEVELOPMENT-ONLY e-Challan provider. Any number plate returns the same 1 or 2 sample
 * challans every time (derived from the plate), so the whole flow (lookup, pay, admin pays
 * within 24 hours, receipt) can be tried before a real provider is connected.
 * env.js refuses CHALLAN_PROVIDER=sandbox in production.
 */
const OFFENCES = {
  bike: [['Riding without helmet', 1000], ['Triple riding', 1000], ['Wrong-side driving', 500]],
  car: [['Driving without seat belt', 1000], ['Over-speeding', 1000], ['Parking in no-parking zone', 500]],
  auto: [['Overloading passengers', 1500], ['Parking in no-parking zone', 500]],
  commercial: [['Overloading', 2000], ['No pollution certificate', 1000]],
  other: [['Red light jump', 1000], ['Parking in no-parking zone', 500]],
}
const PLACES = ['AB Road, Vijay Nagar, Indore', 'Rajwada, Indore', 'Palasia Square, Indore', 'MP Nagar, Bhopal', 'Freeganj, Ujjain']

export const challanSandbox = {
  name: 'sandbox',
  async lookup({ plate, type }) {
    const h = crypto.createHash('sha256').update(plate).digest()
    const list = OFFENCES[type] ?? OFFENCES.other
    const count = 1 + (h[0] % 2)
    return Array.from({ length: count }, (_, i) => {
      const [offence, rupees] = list[(h[1] + i) % list.length]
      const daysAgo = 5 + (h[2 + i] % 50)
      return {
        challanNo: plate.slice(0, 2) + h.readUInt32BE(4 + i * 4).toString().padStart(10, '0').slice(0, 10),
        offence,
        amountPaise: rupees * 100,
        date: new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10),
        place: PLACES[(h[3] + i) % PLACES.length],
        court: daysAgo > 45,
      }
    })
  },
}
