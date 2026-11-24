import { ImageSourcePropType } from 'react-native';

/**
 * SAMPLE DATA for the UI-only phase. Names, photos (free Pexels stock),
 * amounts, vehicle numbers and dates are invented. The backend phase
 * replaces this file with GET /meta and the live API.
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
  /** Typical quote used by the demo advocate. */
  demoFee: number;
  demoScope: string;
};

export const CATEGORIES: Category[] = [
  {
    key: 'criminal',
    name: 'Criminal lawyer',
    short: 'Criminal',
    covers: 'Bail, FIR, cheque bounce, police complaints and trials',
    image: require('../assets/images/cat3d-criminal.png'),
    gstOnService: true,
    demoFee: 8000,
    demoScope: 'Bail application, one hearing, and advice on the next steps.',
  },
  {
    key: 'civil',
    name: 'Civil lawyer',
    short: 'Civil & property',
    covers: 'Property, rent, recovery, contracts and injunctions',
    image: require('../assets/images/cat3d-civil.png'),
    gstOnService: true,
    demoFee: 6000,
    demoScope: 'Legal notice, reply review, and one consultation call in chat.',
  },
  {
    key: 'matrimonial',
    name: 'Matrimonial lawyer',
    short: 'Matrimonial',
    covers: 'Divorce, maintenance, child custody and domestic violence',
    image: require('../assets/images/cat3d-matrimonial.png'),
    gstOnService: true,
    demoFee: 5000,
    demoScope: 'Drafting and filing the joint petition, 2 court appearances, and an application to waive the cooling period.',
  },
  {
    key: 'accident',
    name: 'Accident case',
    short: 'Accident claims',
    covers: 'MACT claims, insurance disputes and compensation',
    image: require('../assets/images/cat3d-accident.png'),
    gstOnService: true,
    demoFee: 4000,
    demoScope: 'Filing the MACT claim petition with the documents you shared.',
  },
  {
    key: 'consumer',
    name: 'Consumer court',
    short: 'Consumer court',
    covers: 'Defective products, builder delays, refunds and services',
    image: require('../assets/images/cat3d-consumer.png'),
    gstOnService: true,
    demoFee: 3500,
    demoScope: 'Consumer complaint drafting and filing before the District Commission.',
  },
  {
    key: 'notary',
    name: 'Notary services',
    short: 'Notary',
    covers: 'Affidavits, agreements and attestation',
    image: require('../assets/images/cat3d-notary.png'),
    gstOnService: false,
    demoFee: 500,
    demoScope: 'Affidavit drafting and notarisation.',
  },
  {
    key: 'other',
    name: 'Other legal services',
    short: 'Other services',
    covers: 'Not sure which one? Describe it and our team will route it',
    image: require('../assets/images/cat3d-other.png'),
    gstOnService: true,
    demoFee: 2000,
    demoScope: 'Consultation and a written opinion on your matter.',
  },
];

export const categoryOf = (k: string) => CATEGORIES.find(c => c.key === k) ?? CATEGORIES[6];

export type Advocate = {
  id: string;
  name: string;
  photo: ImageSourcePropType;
  practice: CategoryKey[];
  years: number;
  court: string;
  district: string;
  rating: number;
  reviews: number;
  languages: string;
  enrolment: string;
};

export const ADVOCATES: Advocate[] = [
  {
    id: 'priya',
    name: 'Adv. Priya Nair',
    photo: require('../assets/images/adv-priya.jpg'),
    practice: ['matrimonial', 'civil'],
    years: 11,
    court: 'Indore District Court',
    district: 'Indore',
    rating: 4.8,
    reviews: 126,
    languages: 'Hindi, English, Malayalam',
    enrolment: 'MP/0874/2015',
  },
  {
    id: 'rohan',
    name: 'Adv. Rohan Malhotra',
    photo: require('../assets/images/adv-rohan.jpg'),
    practice: ['criminal', 'civil'],
    years: 12,
    court: 'Indore District Court',
    district: 'Indore',
    rating: 4.7,
    reviews: 58,
    languages: 'Hindi, English',
    enrolment: 'MP/1287/2014',
  },
  {
    id: 'imran',
    name: 'Adv. Imran Siddiqui',
    photo: require('../assets/images/adv-imran.jpg'),
    practice: ['consumer', 'notary', 'other'],
    years: 8,
    court: 'Bhopal District Court',
    district: 'Bhopal',
    rating: 4.6,
    reviews: 41,
    languages: 'Hindi, Urdu, English',
    enrolment: 'MP/2210/2018',
  },
  {
    id: 'harpreet',
    name: 'Adv. Harpreet Singh Bedi',
    photo: require('../assets/images/adv-harpreet.jpg'),
    practice: ['accident', 'criminal'],
    years: 19,
    court: 'Ujjain District Court',
    district: 'Ujjain',
    rating: 4.9,
    reviews: 203,
    languages: 'Hindi, Punjabi, English',
    enrolment: 'MP/0412/2007',
  },
];

export const advocateFor = (cat: CategoryKey) => ADVOCATES.find(a => a.practice.includes(cat)) ?? ADVOCATES[0];
export const advocateById = (id?: string) => ADVOCATES.find(a => a.id === id);

export const OFFERS = [
  {
    code: 'FIRST10',
    title: '10% off your first consultation',
    sub: 'First consultation · up to ₹500',
    percent: 10,
    max: 500,
    till: 'Till 30 Nov',
    art: ['other', 'notary'],
  },
  {
    code: 'NOTARY100',
    title: '₹100 cashback on notary services',
    sub: 'Notary services · to wallet',
    flat: 0,
    cashback: 100,
    till: 'Auto-applied',
    art: ['notary', 'consumer'],
  },
];

export const BANNERS = [
  { key: 'b1', title: '10% off your first consultation', sub: 'Use code FIRST10 at checkout', tag: 'Till 30 Nov', art: ['other', 'notary'], go: 'offers' },
  { key: 'b2', title: 'Talk to a verified advocate today', sub: 'Matched by our team in your district', tag: 'New', art: ['criminal', 'civil'], go: 'categories' },
  { key: 'b3', title: 'Clear your e-Challans in one go', sub: 'See pending fines and pay safely', tag: 'e-Challan', art: ['challan', 'accident'], go: 'challan' },
];

/** Membership plans. Prices come from the admin; null shows [PRICE] until the client decides. */
export const PLANS = [
  { id: 'month', name: 'Monthly', note: 'Renews every month', months: 1, price: null as number | null },
  { id: 'quarter', name: 'Quarterly', note: '3 months', months: 3, price: null as number | null },
  { id: 'year', name: 'Yearly', note: '12 months', months: 12, price: null as number | null, best: true },
];

export const DISTRICTS = [
  'Indore', 'Bhopal', 'Ujjain', 'Gwalior', 'Jabalpur', 'Dewas', 'Sagar', 'Ratlam',
  'Mumbai', 'Pune', 'Delhi', 'Jaipur', 'Lucknow', 'Ahmedabad', 'Kolkata', 'Bengaluru', 'Hyderabad', 'Chennai',
];

export const STATES = ['Madhya Pradesh', 'Maharashtra', 'Delhi', 'Rajasthan', 'Uttar Pradesh', 'Gujarat', 'West Bengal', 'Karnataka', 'Telangana', 'Tamil Nadu'];

export type Challan = { id: string; vehicle: string; offence: string; amount: number; place: string; date: string; due: string; overdue?: boolean };

export const DEMO_VEHICLES = [
  { number: 'MP 09 AB 1234', model: 'Hyundai i20 · Petrol' },
  { number: 'MP 09 ZX 4410', model: 'Honda Activa · Scooter' },
];

export const CHALLANS: Challan[] = [
  { id: 'MP4521100923', vehicle: 'MP 09 AB 1234', offence: 'Over-speeding', amount: 1000, place: 'AB Road, Vijay Nagar, Indore', date: '02 Nov 2026', due: 'Due in 18 days' },
  { id: 'MP4521100511', vehicle: 'MP 09 AB 1234', offence: 'Parking in no-parking zone', amount: 500, place: 'Rajwada, Indore', date: '27 Oct 2026', due: 'Due in 12 days' },
  { id: 'MP4521099874', vehicle: 'MP 09 AB 1234', offence: 'Driving without seat belt', amount: 1000, place: 'Bhawarkua Square, Indore', date: '14 Oct 2026', due: 'Overdue, may go to court', overdue: true },
  { id: 'MP4521101207', vehicle: 'MP 09 ZX 4410', offence: 'Riding without helmet', amount: 500, place: 'Palasia Square, Indore', date: '09 Nov 2026', due: 'Due in 25 days' },
];

export const PAID_CHALLANS_SEED = [
  { id: 'MP4521097710', vehicle: 'MP 09 AB 1234', offence: 'Red light jump', amount: 1000, paidOn: '05 Sep 2026' },
  { id: 'MP4521093321', vehicle: 'MP 09 AB 1234', offence: 'No helmet (pillion)', amount: 500, paidOn: '11 Jul 2026' },
];

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

/** Placeholder until the client gives the support number. */
export const SUPPORT_WHATSAPP = '';

export const AUTO_CONFIRM_DAYS = 7;
