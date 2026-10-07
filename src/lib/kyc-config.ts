// Browser-safe KYC policy and shared definitions. Server code enforces the same rules.

export const KYC_STATUSES = ["not_started", "in_progress", "submitted", "under_review", "action_required", "verified", "rejected"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const KYC_STATUS_LABEL: Record<KycStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  under_review: "Under review",
  action_required: "Action required",
  verified: "Verified",
  rejected: "Rejected",
};

export const KYC_STATUS_TEXT: Record<KycStatus, string> = {
  not_started: "You haven't started verification yet.",
  in_progress: "Your progress is saved. Finish the remaining steps and submit when ready.",
  submitted: "We've received your application. A member of our team will review it.",
  under_review: "A member of our team is reviewing your application.",
  action_required: "We need a few corrections before we can finish reviewing your application.",
  verified: "Your identity has been checked and approved by our team.",
  rejected: "Your application was not approved. You can start a new application.",
};

/** Statuses in which the customer may edit their application. */
export const EDITABLE: KycStatus[] = ["not_started", "in_progress", "action_required"];

export const KYC_POLICY = {
  maxFileBytes: 5 * 1024 * 1024,
  acceptedMime: ["image/jpeg", "image/png", "application/pdf"] as const,
  requireProofOfAddress: true,
  proofOfAddressRecencyMonths: 3,
  selfieEnabled: true,
  /** Shown to customers only when set, e.g. "2 business days". */
  reviewTimeEstimate: null as string | null,
  maxSubmissionsPerDay: 3,
  maxUploadsPerHour: 30,
};

export const ID_DOC_TYPES = [
  { value: "passport", label: "Passport", needsBack: false, needsIssueDate: true },
  { value: "national_id", label: "National identity card", needsBack: true, needsIssueDate: true },
  { value: "drivers_licence", label: "Driver's licence", needsBack: true, needsIssueDate: true },
] as const;
export type IdDocType = (typeof ID_DOC_TYPES)[number]["value"];

/** Countries where only a passport is accepted for this bank's policy (empty = all types allowed). */
export const PASSPORT_ONLY_COUNTRIES: string[] = [];
export function allowedDocTypes(issuingCountry: string) {
  return PASSPORT_ONLY_COUNTRIES.includes(issuingCountry) ? ID_DOC_TYPES.filter((d) => d.value === "passport") : [...ID_DOC_TYPES];
}

/** Countries without a postal code system — postal code becomes optional. */
export const NO_POSTCODE_COUNTRIES = ["AE", "AG", "AO", "BF", "BI", "BJ", "BO", "BS", "BW", "BZ", "CD", "CF", "CG", "CI", "CM", "DJ", "DM", "ER", "FJ", "GA", "GD", "GH", "GM", "GQ", "GY", "HK", "KI", "KM", "KN", "LC", "ML", "MO", "MR", "MW", "NR", "NU", "QA", "RW", "SB", "SC", "SL", "SR", "ST", "SY", "TD", "TG", "TK", "TL", "TO", "TV", "UG", "VU", "YE", "ZW"];

export const SLOTS = ["id_front", "id_back", "proof_of_address", "selfie"] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<Slot, string> = {
  id_front: "ID document — front",
  id_back: "ID document — back",
  proof_of_address: "Proof of address",
  selfie: "Selfie",
};
export const SLOT_SECTION: Record<Slot, Section> = { id_front: "identity", id_back: "identity", proof_of_address: "supporting", selfie: "supporting" };

export const SECTIONS = ["personal", "address", "identity", "supporting"] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABEL: Record<Section, string> = {
  personal: "Personal details",
  address: "Residential address",
  identity: "Identity document",
  supporting: "Supporting documents",
};

export const EMPLOYMENT = ["Employed", "Self-employed", "Business owner", "Student", "Retired", "Unemployed", "Other"];
export const SOURCE_OF_FUNDS = ["Salary", "Business income", "Savings", "Investments", "Pension", "Inheritance", "Gift", "Other"];
export const ACCOUNT_USE = ["Everyday spending", "Savings", "Receiving salary", "Business payments", "International transfers", "Investments", "Other"];
export const MONTHLY_RANGE = ["Under $1,000", "$1,000 – $5,000", "$5,000 – $20,000", "$20,000 – $50,000", "Over $50,000"];

export type PersonalData = {
  firstName: string; middleName: string; lastName: string; dob: string; nationality: string; residence: string;
  phone: string; occupation: string; employmentStatus: string; sourceOfFunds: string; accountUse: string; monthlyRange: string;
};
export type AddressData = { line1: string; line2: string; city: string; region: string; postalCode: string; country: string };
export type IdentityData = { docType: string; issuingCountry: string; docNumber: string; issueDate: string; expiryDate: string };
export type KycData = { personal: Partial<PersonalData>; address: Partial<AddressData>; identity: Partial<IdentityData> };
export type Correction = { section: Section; message: string };

export function maskDocNumber(n: string) {
  if (!n) return "";
  return n.length <= 4 ? "••••" : `${"•".repeat(Math.min(6, n.length - 4))}${n.slice(-4)}`;
}

/** Legacy column kept for other screens. */
export function legacyStatus(s: KycStatus) {
  return s === "verified" ? "verified" : s === "rejected" ? "rejected" : s === "submitted" || s === "under_review" ? "pending" : "unverified";
}
