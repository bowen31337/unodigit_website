'use client';

import { useState } from 'react';
import type { ContactRequest } from '@unodigit/ba-bot-contract';
import Turnstile, { TURNSTILE_SITE_KEY } from './Turnstile';

interface ContactFormProps {
  pending: boolean;
  onSubmit: (input: Omit<ContactRequest, 'conversationId'>) => Promise<boolean>;
}

/** Read at submit time rather than on mount: the widget floats on every page,
 * so a visitor can land on one page, browse to another, and finish the
 * interview there. The page they actually converted on is the useful one. */
function attribution() {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  const utm = {
    source: p.get('utm_source') ?? undefined,
    medium: p.get('utm_medium') ?? undefined,
    campaign: p.get('utm_campaign') ?? undefined,
  };
  const hasUtm = Boolean(utm.source || utm.medium || utm.campaign);
  return {
    utm: hasUtm ? utm : undefined,
    referrer: document.referrer ? document.referrer.slice(0, 500) : undefined,
    landingPage: window.location.href.slice(0, 500),
  };
}

/**
 * Shown in place of the message input once the graph reaches CONTACT. The API
 * will only accept `consent: true` — an unchecked box is a validation failure,
 * never a silent default — so the button stays disabled until it is ticked.
 */
export default function ContactForm({ pending, onSubmit }: ContactFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // Turnstile is mandatory server-side. If the site key was never baked in, the
  // challenge cannot render and every submission would 403 — so say so plainly
  // rather than presenting a form that cannot succeed.
  const misconfigured = !TURNSTILE_SITE_KEY;
  const ready = Boolean(email.trim()) && consent && Boolean(token) && !pending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !token) return;
    await onSubmit({
      name: name.trim() || undefined,
      email: email.trim(),
      company: company.trim() || undefined,
      role: role.trim() || undefined,
      // Omitted entirely when blank rather than sent as '' — the contract
      // marks it optional, and an empty string is not a phone number.
      phone: phone.trim() || undefined,
      consent: true,
      turnstileToken: token,
      ...attribution(),
    });
  }

  if (misconfigured) {
    return (
      <p className="type-footnote p-s5" style={{ color: 'var(--label-secondary)' }}>
        Contact capture is unavailable right now — please email{' '}
        <a href="mailto:info@unodigit.com.au" className="text-accent-ink">
          info@unodigit.com.au
        </a>
        .
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-s4 p-s5">
      <div className="space-y-s1">
        <p className="type-footnote" style={{ color: 'var(--label)' }}>
          Where should we send your scope and estimate?
        </p>
        {/* One statement instead of tagging four of five fields "(optional)".
            Company, role and mobile are all optional server-side; only three
            carried the suffix, so Company read as required purely by omission.
            Saying the rule once is both accurate and quieter. */}
        <p className="type-caption" style={{ color: 'var(--label-secondary)' }}>
          Only your email address is required.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-s3">
        <input
          type="text"
          className="field"
          placeholder="Name"
          aria-label="Name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          className="field"
          placeholder="Company"
          aria-label="Company (optional)"
          autoComplete="organization"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      <input
        type="email"
        required
        className="field"
        placeholder="Email address"
        aria-label="Email address (required)"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="text"
        className="field"
        placeholder="Your role"
        aria-label="Your role (optional)"
        autoComplete="organization-title"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      />

      {/* type="tel" for the numeric keypad on mobile, with no `required` and no
          pattern: international formats vary more than a regex can capture, and
          rejecting a real number on a lead-capture form costs more than storing
          an odd one. Validation is a length cap in the contract only. */}
      <input
        type="tel"
        className="field"
        placeholder="Mobile"
        aria-label="Mobile number (optional)"
        autoComplete="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />

      <label className="type-footnote flex min-h-[44px] cursor-pointer items-center gap-s3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="h-5 w-5 shrink-0 accent-[var(--accent-solid)]"
        />
        <span style={{ color: 'var(--label-secondary)' }}>
          I agree to Uno Digit contacting me about this enquiry.
        </span>
      </label>

      <Turnstile onToken={setToken} />

      <button type="submit" className="btn btn-filled w-full" disabled={!ready}>
        {pending ? 'Sending…' : 'Send it through'}
      </button>

      {/* The one genuinely opaque state: every field filled, consent ticked,
          and the button still dead because the challenge has not returned a
          token yet (measured at ~5s). Without this the form looks broken. */}
      {!token && !pending && Boolean(email.trim()) && consent && (
        <p className="type-caption text-center" aria-live="polite" style={{ color: 'var(--label-secondary)' }}>
          Just finishing a quick browser check…
        </p>
      )}
    </form>
  );
}
