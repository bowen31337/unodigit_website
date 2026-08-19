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
      <p className="type-footnote" style={{ color: 'var(--label-secondary)' }}>
        Where should we send your scope and estimate?
      </p>

      <div className="grid grid-cols-2 gap-s3">
        <input
          type="text"
          className="field"
          placeholder="Name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          className="field"
          placeholder="Company"
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
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="text"
        className="field"
        placeholder="Your role (optional)"
        autoComplete="organization-title"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      />

      <label className="type-footnote flex cursor-pointer items-start gap-s3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-solid)]"
        />
        <span style={{ color: 'var(--label-secondary)' }}>
          I agree to Uno Digit contacting me about this enquiry.
        </span>
      </label>

      <Turnstile onToken={setToken} />

      <button type="submit" className="btn btn-filled w-full" disabled={!ready}>
        {pending ? 'Sending…' : 'Send it through'}
      </button>
    </form>
  );
}
