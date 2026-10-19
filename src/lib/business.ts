// Seller details for invoices, the Contact page and the policies (set these in the environment).
export interface BusinessInfo {
  name: string;
  owner: string;
  email: string;
  phone: string;
  address: string;
  gstin: string | null;
}

/** Shown on invoices, the Contact page and the policies (set these in the environment). */
export function businessInfo(): BusinessInfo {
  return {
    name: process.env.BUSINESS_NAME || "Budget Pro",
    owner: process.env.BUSINESS_OWNER || "Dhrumil Panchal",
    email: process.env.BUSINESS_EMAIL || process.env.SMTP_USER || "dhrumilpanchal295@gmail.com",
    phone: process.env.BUSINESS_PHONE || "",
    address: process.env.BUSINESS_ADDRESS || "Gujarat, India",
    gstin: process.env.BUSINESS_GSTIN || null,
  };
}
