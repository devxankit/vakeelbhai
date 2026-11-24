/**
 * SAMPLE DATA for the UI-only phase (same as mobile-app/src/data/catalog.ts).
 * Names, photos (free Pexels stock), amounts and vehicle numbers are invented.
 * The backend phase replaces this with GET /api/meta and the admin settings.
 */
import catCriminal from '@/assets/images/cat-criminal.jpg'
import catCivil from '@/assets/images/cat-civil.jpg'
import catMatrimonial from '@/assets/images/cat-matrimonial.jpg'
import catAccident from '@/assets/images/cat-accident.jpg'
import catConsumer from '@/assets/images/cat-consumer.jpg'
import catNotary from '@/assets/images/cat-notary.jpg'
import catOther from '@/assets/images/cat-other.jpg'
import catChallan from '@/assets/images/cat-challan.jpg'
import advPriya from '@/assets/images/adv-priya.jpg'
import advRohan from '@/assets/images/adv-rohan.jpg'
import advImran from '@/assets/images/adv-imran.jpg'
import advHarpreet from '@/assets/images/adv-harpreet.jpg'
import clientAnanya from '@/assets/images/client-ananya.jpg'
import clientGurpreet from '@/assets/images/client-gurpreet.jpg'
import bannerGavel from '@/assets/images/banner-gavel.jpg'
import bannerConsult from '@/assets/images/banner-consult.jpg'
import bannerTraffic from '@/assets/images/banner-traffic.jpg'
import emblem from '@/assets/images/emblem-gold.png'
import wordmarkWhite from '@/assets/images/wordmark-white.png'
import wordmarkInk from '@/assets/images/wordmark-ink.png'
import heroAdvocate from '@/assets/images/hero-advocate.jpg'

export const IMG = { emblem, wordmarkWhite, wordmarkInk, heroAdvocate, bannerGavel, bannerConsult, bannerTraffic, catChallan, clientAnanya, clientGurpreet, advRohan }

export const CATEGORIES = [
  { key: 'criminal', name: 'Criminal lawyer', short: 'Criminal', covers: 'Bail, FIR, cheque bounce, police complaints and trials', image: catCriminal, gstOnService: true, demoFee: 8000, demoScope: 'Bail application, one hearing, and advice on the next steps.', tone: { bg: '#F6E8E6', fg: '#8C2F2F' },
    long: 'Arrested or facing a police complaint? A verified criminal lawyer helps with bail, anticipatory bail, FIR quashing, cheque bounce (Section 138) cases and trial representation.', docs: ['FIR or complaint copy', 'Any notice received', 'ID proof'] },
  { key: 'civil', name: 'Civil lawyer', short: 'Civil & property', covers: 'Property, rent, recovery, contracts and injunctions', image: catCivil, gstOnService: true, demoFee: 6000, demoScope: 'Legal notice, reply review, and one consultation call in chat.', tone: { bg: '#E7EEF5', fg: '#2F5D8C' },
    long: 'Property disputes, rent and tenancy, money recovery, partition, contracts and injunctions. Get a legal notice drafted or your case filed by a verified civil lawyer.', docs: ['Agreement or sale deed', 'Correspondence with the other party', 'Payment proofs'] },
  { key: 'matrimonial', name: 'Matrimonial lawyer', short: 'Matrimonial', covers: 'Divorce, maintenance, child custody and domestic violence', image: catMatrimonial, gstOnService: true, demoFee: 5000, demoScope: 'Drafting and filing the joint petition, 2 court appearances, and an application to waive the cooling period.', tone: { bg: '#F4E8F0', fg: '#8C3F72' },
    long: 'Mutual consent or contested divorce, maintenance, child custody, domestic violence and dowry matters, handled privately by a verified family lawyer.', docs: ['Marriage certificate', 'Address proof', 'Any court notice'] },
  { key: 'accident', name: 'Accident case', short: 'Accident claims', covers: 'MACT claims, insurance disputes and compensation', image: catAccident, gstOnService: true, demoFee: 4000, demoScope: 'Filing the MACT claim petition with the documents you shared.', tone: { bg: '#FBEEE2', fg: '#B54708' },
    long: 'Road accident compensation (MACT), insurance claim disputes and settlement. A verified lawyer files and follows up your claim.', docs: ['FIR', 'Medical bills and reports', 'Insurance policy'] },
  { key: 'consumer', name: 'Consumer court', short: 'Consumer court', covers: 'Defective products, builder delays, refunds and services', image: catConsumer, gstOnService: true, demoFee: 3500, demoScope: 'Consumer complaint drafting and filing before the District Commission.', tone: { bg: '#E6F2EC', fg: '#2F7A5D' },
    long: 'Defective products, deficient services, builder delays, insurance and bank complaints. File before the District Consumer Commission with a verified lawyer.', docs: ['Invoice or agreement', 'Messages and emails with the seller', 'Photos of the defect'] },
  { key: 'notary', name: 'Notary services', short: 'Notary', covers: 'Affidavits, agreements and attestation', image: catNotary, gstOnService: false, demoFee: 500, demoScope: 'Affidavit drafting and notarisation.', tone: { bg: '#ECE9F5', fg: '#5B4A8C' },
    long: 'Affidavits, rent agreements, declarations and attestation, drafted and notarised quickly.', docs: ['Details to include', 'ID proof'] },
  { key: 'other', name: 'Other legal services', short: 'Other services', covers: 'Not sure which one? Describe it and our team will route it', image: catOther, gstOnService: true, demoFee: 2000, demoScope: 'Consultation and a written opinion on your matter.', tone: { bg: '#EFEDE8', fg: '#4A4740' },
    long: 'Not sure which kind of lawyer you need? Describe your problem and our team will route it to the right verified advocate.', docs: ['Anything related to your matter'] },
]
export const categoryOf = (k) => CATEGORIES.find((c) => c.key === k) ?? CATEGORIES[6]

export const PHOTOS = { priya: advPriya, rohan: advRohan, imran: advImran, harpreet: advHarpreet, ananya: clientAnanya, gurpreet: clientGurpreet }

export const DISTRICTS = ['Indore', 'Bhopal', 'Ujjain', 'Gwalior', 'Jabalpur', 'Dewas', 'Sagar', 'Ratlam', 'Mumbai', 'Pune', 'Delhi', 'Jaipur', 'Lucknow', 'Ahmedabad', 'Kolkata', 'Bengaluru', 'Hyderabad', 'Chennai']
export const STATES = ['Madhya Pradesh', 'Maharashtra', 'Delhi', 'Rajasthan', 'Uttar Pradesh', 'Gujarat', 'West Bengal', 'Karnataka', 'Telangana', 'Tamil Nadu']
export const REQ_LANGS = ['Hindi', 'English', 'Marathi', 'Gujarati', 'Bengali', 'Punjabi', 'Tamil', 'Telugu', 'Kannada']

export const DOC_STEPS = [
  { key: 'districtBar', title: 'District Bar Association card', hint: 'Your District Bar Association membership card. Both sides if it has text on the back.' },
  { key: 'stateBar', title: 'State Bar Council certificate', hint: 'The certificate issued by your State Bar Council.' },
  { key: 'enrolment', title: 'Enrolment certificate', hint: 'Your enrolment certificate or a clear copy of it.' },
  { key: 'aadhaarFront', title: 'Aadhaar (front)', hint: 'Only our verification team can see it.' },
  { key: 'aadhaarBack', title: 'Aadhaar (back)', hint: 'With the address readable.' },
]

export const CHALLANS = [
  { id: 'MP4521100923', vehicle: 'MP 09 AB 1234', offence: 'Over-speeding', amount: 1000, place: 'AB Road, Vijay Nagar, Indore', date: '02 Nov 2026', due: 'Due in 18 days' },
  { id: 'MP4521100511', vehicle: 'MP 09 AB 1234', offence: 'Parking in no-parking zone', amount: 500, place: 'Rajwada, Indore', date: '27 Oct 2026', due: 'Due in 12 days' },
  { id: 'MP4521099874', vehicle: 'MP 09 AB 1234', offence: 'Driving without seat belt', amount: 1000, place: 'Bhawarkua Square, Indore', date: '14 Oct 2026', due: 'Overdue, may go to court', overdue: true },
  { id: 'MP4521101207', vehicle: 'MP 09 ZX 4410', offence: 'Riding without helmet', amount: 500, place: 'Palasia Square, Indore', date: '09 Nov 2026', due: 'Due in 25 days' },
]

export const FAQS = [
  { q: 'Will the advocate see my phone number?', a: "No. You and your advocate talk through private chat. Neither side's phone number is shared." },
  { q: 'When does the advocate get paid?', a: "Your payment is held by Vakeel Bhai. It is released after you confirm the work is done, or automatically after a few days if you don't raise a dispute." },
  { q: 'How are advocates verified?', a: "Our team checks each advocate's District Bar Association card, State Bar Council certificate, enrolment certificate and Aadhaar before their profile goes live." },
  { q: 'Can I get a refund?', a: 'If the work is not done, raise a dispute from the request before confirming. Our team reviews it and can refund you.' },
  { q: 'How does the commission work for advocates?', a: 'Vakeel Bhai keeps a commission (20% at launch, set by the admin) plus GST on that commission. The rest goes to your wallet when the client confirms.' },
  { q: 'Is Vakeel Bhai a law firm?', a: 'No. Vakeel Bhai is a technology platform that connects you with independent, verified advocates.' },
]

export const DECLINE_REASONS = ['Not my practice area', 'Too many active cases', 'Conflict of interest', 'Not available this week']
export const DISPUTE_REASONS = ['Work not done as agreed', 'Advocate stopped responding', 'Charged more than the quote', 'Other']
export const GST_RETURNS = ['GSTR-1', 'GSTR-3B', 'GSTR-9 (annual)', 'New GST registration']
export const GST_STATUSES = ['Requested', 'In review', 'Documents needed', 'Filed', 'Closed']

export const PLAY_STORE_URL = import.meta.env.VITE_PLAY_STORE_URL || ''
