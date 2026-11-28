/**
 * The seven categories from the signed SOW (5.2), with the copy from frontend/src/lib/catalog.js.
 * gstOnService follows the current UI (no GST on notary). It is a placeholder until the
 * client's CA confirms the GST treatment of legal services, and the admin can change it.
 */
export const SOW_CATEGORIES = [
  {
    key: 'criminal',
    name: 'Criminal lawyer',
    short: 'Criminal',
    covers: 'Bail, FIR, cheque bounce, police complaints and trials',
    description: 'Arrested or facing a police complaint? A verified criminal lawyer helps with bail, anticipatory bail, FIR quashing, cheque bounce (Section 138) cases and trial representation.',
    typicalDocs: ['FIR or complaint copy', 'Any notice received', 'ID proof'],
    gstOnService: true,
  },
  {
    key: 'civil',
    name: 'Civil lawyer',
    short: 'Civil & property',
    covers: 'Property, rent, recovery, contracts and injunctions',
    description: 'Property disputes, rent and tenancy, money recovery, partition, contracts and injunctions. Get a legal notice drafted or your case filed by a verified civil lawyer.',
    typicalDocs: ['Agreement or sale deed', 'Correspondence with the other party', 'Payment proofs'],
    gstOnService: true,
  },
  {
    key: 'matrimonial',
    name: 'Matrimonial lawyer',
    short: 'Matrimonial',
    covers: 'Divorce, maintenance, child custody and domestic violence',
    description: 'Mutual consent or contested divorce, maintenance, child custody, domestic violence and dowry matters, handled privately by a verified family lawyer.',
    typicalDocs: ['Marriage certificate', 'Address proof', 'Any court notice'],
    gstOnService: true,
  },
  {
    key: 'accident',
    name: 'Accident case',
    short: 'Accident claims',
    covers: 'MACT claims, insurance disputes and compensation',
    description: 'Road accident compensation (MACT), insurance claim disputes and settlement. A verified lawyer files and follows up your claim.',
    typicalDocs: ['FIR', 'Medical bills and reports', 'Insurance policy'],
    gstOnService: true,
  },
  {
    key: 'consumer',
    name: 'Consumer court',
    short: 'Consumer court',
    covers: 'Defective products, builder delays, refunds and services',
    description: 'Defective products, deficient services, builder delays, insurance and bank complaints. File before the District Consumer Commission with a verified lawyer.',
    typicalDocs: ['Invoice or agreement', 'Messages and emails with the seller', 'Photos of the defect'],
    gstOnService: true,
  },
  {
    key: 'notary',
    name: 'Notary services',
    short: 'Notary',
    covers: 'Affidavits, agreements and attestation',
    description: 'Affidavits, rent agreements, declarations and attestation, drafted and notarised quickly.',
    typicalDocs: ['Details to include', 'ID proof'],
    gstOnService: false,
  },
  {
    key: 'other',
    name: 'Other legal services',
    short: 'Other services',
    covers: 'Not sure which one? Describe it and our team will route it',
    description: 'Not sure which kind of lawyer you need? Describe your problem and our team will route it to the right verified advocate.',
    typicalDocs: ['Anything related to your matter'],
    gstOnService: true,
  },
]
