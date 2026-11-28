import { ImageSourcePropType } from 'react-native';

/**
 * App constants: category artwork and colours, form options (districts, states,
 * vehicle types), document steps and help text. Everything that changes (names,
 * prices, rates, people, money) comes from the API.
 */

export type CategoryKey = 'criminal' | 'civil' | 'matrimonial' | 'accident' | 'consumer' | 'notary' | 'other';

export type Category = {
  key: CategoryKey;
  name: string;
  short: string;
  covers: string;
  image: ImageSourcePropType;
  /** GST charged on the client's fee for this category (admin setting). */
  gstOnService: boolean;
};

export const CATEGORIES: Category[] = [
  {
    key: 'criminal',
    name: 'Criminal lawyer',
    short: 'Criminal',
    covers: 'Bail, FIR, cheque bounce, police complaints and trials',
    image: require('../assets/images/cat3d-criminal.png'),
    gstOnService: true,
  },
  {
    key: 'civil',
    name: 'Civil lawyer',
    short: 'Civil & property',
    covers: 'Property, rent, recovery, contracts and injunctions',
    image: require('../assets/images/cat3d-civil.png'),
    gstOnService: true,
  },
  {
    key: 'matrimonial',
    name: 'Matrimonial lawyer',
    short: 'Matrimonial',
    covers: 'Divorce, maintenance, child custody and domestic violence',
    image: require('../assets/images/cat3d-matrimonial.png'),
    gstOnService: true,
  },
  {
    key: 'accident',
    name: 'Accident case',
    short: 'Accident claims',
    covers: 'MACT claims, insurance disputes and compensation',
    image: require('../assets/images/cat3d-accident.png'),
    gstOnService: true,
  },
  {
    key: 'consumer',
    name: 'Consumer court',
    short: 'Consumer court',
    covers: 'Defective products, builder delays, refunds and services',
    image: require('../assets/images/cat3d-consumer.png'),
    gstOnService: true,
  },
  {
    key: 'notary',
    name: 'Notary services',
    short: 'Notary',
    covers: 'Affidavits, agreements and attestation',
    image: require('../assets/images/cat3d-notary.png'),
    gstOnService: false,
  },
  {
    key: 'other',
    name: 'Other legal services',
    short: 'Other services',
    covers: 'Not sure which one? Describe it and our team will route it',
    image: require('../assets/images/cat3d-other.png'),
    gstOnService: true,
  },
];

/** The look of a category (artwork, colours) with its live name from the admin (GET /api/meta). */
export function categoryOf(k: string, meta?: { categories: { key: string; name: string; short: string; covers: string; gstOnService?: boolean }[] } | null): Category {
  const local = CATEGORIES.find(c => c.key === k) ?? CATEGORIES[6];
  const live = meta?.categories.find(c => c.key === k);
  return live ? { ...local, key: k as CategoryKey, name: live.name, short: live.short || live.name, covers: live.covers, gstOnService: live.gstOnService ?? local.gstOnService } : local;
}

/** Fixed promotions in the app (admin-managed banners and offers come with Phase 4b). */
export const BANNERS = [
  { key: 'b2', title: 'Talk to a verified advocate today', sub: 'Matched by our team in your district', tag: 'New', art: ['criminal', 'civil'], go: 'categories' },
  { key: 'b3', title: 'Clear your e-Challans in one go', sub: 'See pending fines and pay safely', tag: 'e-Challan', art: ['challan', 'accident'], go: 'challan' },
];

export const DISTRICTS = [
  'Indore', 'Bhopal', 'Ujjain', 'Gwalior', 'Jabalpur', 'Dewas', 'Sagar', 'Ratlam',
  'Mumbai', 'Pune', 'Delhi', 'Jaipur', 'Lucknow', 'Ahmedabad', 'Kolkata', 'Bengaluru', 'Hyderabad', 'Chennai',
];

export const STATES = ['Madhya Pradesh', 'Maharashtra', 'Delhi', 'Rajasthan', 'Uttar Pradesh', 'Gujarat', 'West Bengal', 'Karnataka', 'Telangana', 'Tamil Nadu'];

/** Vehicle types the client picks before entering the number plate. */
export const VEHICLE_TYPES = [
  { key: 'bike', label: 'Bike / scooter' },
  { key: 'car', label: 'Car' },
  { key: 'auto', label: 'Auto-rickshaw' },
  { key: 'commercial', label: 'Truck / commercial' },
  { key: 'other', label: 'Other' },
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number]['key'];
export const vehicleTypeLabel = (k?: string) => VEHICLE_TYPES.find(v => v.key === k)?.label ?? 'Vehicle';

/** Indian number plate, spaces optional: MP09AB1234, DL3CAB1234, 22BH1234AA. */
export const plateOk = (n: string) => /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$/.test(n.replace(/[\s-]/g, '').toUpperCase());

/** "mp09ab1234" → "MP 09 AB 1234" */
export function platePretty(n: string) {
  const c = n.replace(/[\s-]/g, '').toUpperCase();
  const m = c.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{4})$/);
  return m ? [m[1], m[2].padStart(2, '0'), m[3], m[4]].filter(Boolean).join(' ') : c;
}

export const DOC_STEPS = [
  { key: 'districtBar', title: 'District Bar Association card', hint: 'Photograph your District Bar Association membership card. Both sides if it has text on the back.' },
  { key: 'stateBar', title: 'State Bar Council certificate', hint: 'Photograph the certificate issued by your State Bar Council. Our team checks it against your enrolment number.' },
  { key: 'enrolment', title: 'Enrolment certificate', hint: 'Photograph your enrolment certificate or a clear copy of it.' },
  { key: 'aadhaarFront', title: 'Aadhaar (front)', hint: 'Photograph the front of your Aadhaar card. Only our verification team can see it.' },
  { key: 'aadhaarBack', title: 'Aadhaar (back)', hint: 'Photograph the back of your Aadhaar card, with the address readable.' },
] as const;

export type DocKey = (typeof DOC_STEPS)[number]['key'];

export const FAQS = [
  { q: 'Will the advocate see my phone number?', a: 'No. You and your advocate talk through private chat in the app. Neither side\'s phone number is shared.' },
  { q: 'When does the advocate get paid?', a: 'Your payment is held by Vakeel Bhai. It is released after you confirm the work is done, or automatically after 7 days if you don\'t raise a dispute.' },
  { q: 'How are advocates verified?', a: 'Our team checks each advocate\'s District Bar Association card, State Bar Council certificate, enrolment certificate and Aadhaar before their profile goes live.' },
  { q: 'Can I get a refund?', a: 'If the work is not done, raise a dispute from the request screen before confirming. Our team reviews it and can refund you.' },
  { q: 'How does the commission work for advocates?', a: 'Vakeel Bhai keeps a commission (20% at launch, set by the admin) plus GST on that commission. The rest goes to your wallet when the client confirms.' },
];
