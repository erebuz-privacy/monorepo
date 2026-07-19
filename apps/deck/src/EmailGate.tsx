import { useState, type FormEvent, type ReactNode } from 'react';

/**
 * Email gate shown before the deck. Submissions POST straight into the same
 * Google Form as the landing waitlist (no backend), and the email is kept in
 * localStorage so a viewer is only asked once per browser.
 *
 * To collect deck viewers in their own sheet, create a dedicated Google Form
 * (one short-answer "Email" question, use "Get pre-filled link" to grab the
 * ids) and swap the two constants below.
 */
const FORM_ID = '1FAIpQLSeyCfVILyiS-3IKPn1OKboKNF-xmMGcbSMW8XBlptzB58xJig';
const EMAIL_ENTRY = 'entry.117664500';

const FORM_URL = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`;
const STORAGE_KEY = 'erebuz-deck:viewer-email';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function EmailGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return Boolean(localStorage.getItem(STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (unlocked) return <>{children}</>;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    if (!email) {
      setError('Please enter your email.');
      return;
    }
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      setError("That doesn't look like a valid email address.");
      return;
    }
    setSending(true);
    try {
      // no-cors: the response is opaque, reaching past this line means "sent".
      await fetch(FORM_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ [EMAIL_ENTRY]: email }),
      });
    } catch {
      // network hiccup - still let the viewer through, the gate is a
      // lead-capture step, not an auth wall
    }
    try {
      localStorage.setItem(STORAGE_KEY, email);
    } catch {
      // private mode etc. - proceed without persistence
    }
    setUnlocked(true);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        color: 'var(--fg)',
        fontFamily: 'var(--font-body)',
        padding: 24,
      }}
    >
      <img
        src="/erebuz-logo.svg"
        alt="Erebuz"
        style={{ width: 44, height: 44, marginBottom: 24, filter: 'brightness(0) invert(0.96)' }}
      />
      <h1
        className="display"
        style={{
          fontSize: 'clamp(28px, 4.5vw, 44px)',
          fontWeight: 700,
          letterSpacing: '-0.03em',
          margin: 0,
          textAlign: 'center',
        }}
      >
        Erebuz — the deck
      </h1>
      <p
        style={{
          color: 'var(--fg-muted)',
          fontSize: 'clamp(14px, 1.4vw, 16px)',
          lineHeight: 1.6,
          margin: '14px 0 0',
          maxWidth: 380,
          textAlign: 'center',
        }}
      >
        Drop your email and the deck is yours. We'll only use it to follow up.
      </p>

      <form
        onSubmit={submit}
        noValidate
        style={{
          marginTop: 32,
          width: '100%',
          maxWidth: 380,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <input
          type="email"
          name="email"
          autoFocus
          placeholder="you@fund.com"
          onChange={() => setError(null)}
          aria-invalid={Boolean(error)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'transparent',
            border: `1px solid ${error ? 'rgba(255, 107, 107, 0.6)' : 'var(--hair)'}`,
            color: 'var(--fg)',
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            padding: '14px 16px',
            outline: 'none',
            borderRadius: 0,
          }}
        />
        {error ? (
          <p style={{ color: '#ff6b6b', fontSize: 12.5, margin: 0 }}>{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={sending}
          style={{
            background: 'var(--fg)',
            color: 'var(--accent-ink)',
            border: 'none',
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            fontWeight: 600,
            padding: '14px 16px',
            cursor: sending ? 'default' : 'pointer',
            opacity: sending ? 0.6 : 1,
            borderRadius: 0,
          }}
        >
          {sending ? 'One sec…' : 'View the deck'}
        </button>
      </form>

      <p
        style={{
          position: 'absolute',
          bottom: 24,
          color: 'var(--fg-faint)',
          fontSize: 12,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        erebuz.com
      </p>
    </div>
  );
}
