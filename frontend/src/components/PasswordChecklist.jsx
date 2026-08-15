import { Check, Circle } from 'lucide-react';
import './AuthShell.css';

/**
 * Live password policy checklist.
 *
 * These rules mirror the server-side policy in
 * backend/src/utils/passwordPolicy.js — the server is the enforcer; this is
 * only a live hint. If one changes, change the other.
 */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'uppercase', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'One number', test: (p) => /[0-9]/.test(p) },
  { id: 'symbol', label: 'One symbol', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/** True when the password satisfies every rule. */
export function meetsPolicy(password) {
  return PASSWORD_RULES.every((r) => r.test(password || ''));
}

export default function PasswordChecklist({ password = '' }) {
  return (
    <ul className="policy-checklist" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li key={rule.id} className={met ? 'is-met' : ''}>
            {met ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Circle size={14} aria-hidden="true" />
            )}
            <span>{rule.label}</span>
            <span className="sr-only">{met ? ' — met' : ' — not met'}</span>
          </li>
        );
      })}
    </ul>
  );
}
