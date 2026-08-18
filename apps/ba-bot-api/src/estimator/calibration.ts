/**
 * FROZEN. Reference decompositions that anchor the estimator's counts.
 *
 * A small model gives stable numbers when it has worked examples to interpolate
 * between, and drifts badly without them. These three span the realistic range.
 *
 * REPLACE THESE with real `claw-forge plan` outputs before trusting a quote in
 * front of a client. They are plausible placeholders, not measurements, and the
 * whole estimate is only as calibrated as this constant.
 */
export const CALIBRATION = `Reference decompositions, for scale:

A. Single-user expense tracker. CRUD, CSV export, one auth method, no integrations.
   Authentication & User Management 6, Core functionality 14, Data management 8,
   UI/UX 9, API layer 5, Admin features 0, Integrations 0. Total 42. Confidence high.

B. Multi-tenant booking platform. Roles, calendar, Stripe, email + SMS reminders.
   Authentication & User Management 14, Core functionality 38, Data management 18,
   UI/UX 20, API layer 14, Admin features 8, Integrations 16. Total 128. Confidence medium.

C. Field-service management suite. Dispatch, mobile technician app, inventory,
   invoicing, three third-party integrations, offline sync.
   Authentication & User Management 20, Core functionality 96, Data management 42,
   UI/UX 46, API layer 30, Admin features 18, Integrations 32. Total 284. Confidence low.`
