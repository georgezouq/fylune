/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import { LockKey, SignIn, SpinnerGap, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import fyluneIcon from "../build/icon.png";
export function WelcomeLoginModal({ authBridge, onComplete }) {
  const { t } = useTranslation();
  const modal = useRef(null);
  const primaryAction = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => primaryAction.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") onComplete("skipped");
      if (event.key !== "Tab") return;
      const focusable = [...(modal.current?.querySelectorAll("button:not(:disabled), input:not(:disabled)") || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !modal.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !modal.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onComplete]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = mode === "register"
        ? await authBridge.register({ email, password })
        : await authBridge.signIn({ email, password });
      if (session?.user) {
        onComplete({ status: "signed-in", session });
      }
      else setError(t("welcomeLogin.signInFailed"));
    } catch (signInError) {
      setError(signInError?.message || t("welcomeLogin.signInFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="welcome-login-backdrop">
      <section
        ref={modal}
        className="welcome-login-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-login-title"
        aria-describedby="welcome-login-copy"
      >
        <button
          type="button"
          className="welcome-login-close"
          aria-label={t("common.close")}
          onClick={() => onComplete("skipped")}
        >
          <X />
        </button>

        <img className="welcome-login-app-icon" src={fyluneIcon} alt="" />
        <h1 id="welcome-login-title">{t("welcomeLogin.title")}</h1>
        <p id="welcome-login-copy">{t("welcomeLogin.copy")}</p>

        <div className="welcome-login-local-note">
          <LockKey weight="duotone" />
          <span>
            <strong>{t("welcomeLogin.localTitle")}</strong>
            <small>{t("welcomeLogin.localCopy")}</small>
          </span>
        </div>

        <form className="welcome-login-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input ref={primaryAction} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            <span>Password</span>
            <input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 12 : 1} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {mode === "register" ? <small>Use at least 12 characters with uppercase, lowercase, and a number.</small> : null}
          <div className="welcome-login-actions">
            <button
              type="button"
              className="secondary-button welcome-login-skip"
              onClick={() => { setMode((current) => current === "signin" ? "register" : "signin"); setError(""); }}
            >
              {mode === "signin" ? "Create account" : "Use existing account"}
            </button>
            <button
              type="submit"
              className="primary-button welcome-login-primary"
              disabled={loading}
            >
              {loading ? <SpinnerGap className="spin" /> : <SignIn />}
              {loading ? "Please wait…" : mode === "signin" ? t("welcomeLogin.signIn") : "Create account"}
            </button>
          </div>
        </form>
        <button type="button" className="welcome-login-continue-local" onClick={() => onComplete("skipped")}>
          {t("welcomeLogin.skip")}
        </button>
        {loading ? <p className="welcome-login-status" role="status">Connecting to the optional account service…</p> : null}
        {error ? <p className="welcome-login-error" role="alert">{error}</p> : null}
      </section>
    </div>
  );
}
