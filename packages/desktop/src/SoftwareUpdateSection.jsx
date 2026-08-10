/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import {
  ArrowsClockwise,
  CheckCircle,
  CircleNotch,
  DownloadSimple,
  Storefront,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { IconButton } from "./design-system/IconButton.jsx";

function stateMessage(t, state) {
  if (!state) return t("settings.updates.loading");
  if (state.distribution === "app_store") return t("settings.updates.appStore");
  if (state.distribution === "development") return t("settings.updates.development");
  if (state.distribution === "unsupported") return t("settings.updates.unsupported");
  if (state.status === "checking") return t("settings.updates.checking");
  if (state.status === "available") {
    return t("settings.updates.available", { version: state.availableVersion });
  }
  if (state.status === "downloading") {
    return t("settings.updates.downloading", { progress: state.progress ?? 0 });
  }
  if (state.status === "downloaded") {
    return t("settings.updates.downloaded", { version: state.availableVersion });
  }
  if (state.status === "installing") return t("settings.updates.installing");
  if (state.status === "not_available") return t("settings.updates.current");
  if (state.status === "error") {
    return t(`settings.updates.errors.${state.errorCode}`, {
      defaultValue: t("settings.updates.errors.UPDATE_FAILED"),
    });
  }
  return t("settings.updates.ready");
}

function stateIcon(state) {
  if (state?.distribution === "app_store") return <Storefront aria-hidden="true" />;
  if (state?.status === "error") return <WarningCircle aria-hidden="true" />;
  if (state?.status === "available" || state?.status === "downloaded") {
    return <DownloadSimple aria-hidden="true" />;
  }
  if (state?.status === "not_available") return <CheckCircle aria-hidden="true" />;
  return <ArrowsClockwise aria-hidden="true" />;
}

function actionForState(t, state) {
  if (!state?.canSelfUpdate) return null;
  if (state.status === "available") {
    return { label: t("settings.updates.download"), method: "downloadUpdate" };
  }
  if (state.status === "downloaded") {
    return { label: t("settings.updates.restart"), method: "installUpdate" };
  }
  if (new Set(["checking", "downloading", "installing"]).has(state.status)) return null;
  return { label: t("settings.updates.check"), method: "checkForUpdates" };
}

function useSoftwareUpdate(updateBridge) {
  const { t } = useTranslation();
  const [state, setState] = useState(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    updateBridge.getUpdateState()
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {
        if (active) setState({
          distribution: "direct",
          canSelfUpdate: false,
          status: "error",
          currentVersion: null,
          errorCode: "UPDATE_FAILED",
        });
      });
    const unsubscribe = updateBridge.onUpdateStateChange?.((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [updateBridge]);

  const action = actionForState(t, state);

  async function performAction() {
    if (!action || pending) return;
    setPending(true);
    try {
      const next = await updateBridge[action.method]();
      if (next) setState(next);
    } catch {
      setState((current) => ({
        ...current,
        distribution: current?.distribution ?? "direct",
        canSelfUpdate: current?.canSelfUpdate ?? false,
        status: "error",
        errorCode: "UPDATE_FAILED",
      }));
    } finally {
      setPending(false);
    }
  }

  const busy = pending || new Set(["checking", "downloading", "installing"]).has(state?.status);
  return { action, busy, performAction, state, t };
}

export function SidebarUpdateButton({ updateBridge }) {
  const { action, busy, performAction, state, t } = useSoftwareUpdate(updateBridge);
  const promptedVersion = useRef(null);

  useEffect(() => {
    if (state?.status !== "downloaded" || promptedVersion.current === state.availableVersion) return;
    promptedVersion.current = state.availableVersion;
    if (window.confirm(`${stateMessage(t, state)}\n\n${t("settings.updates.restart")}?`)) {
      void performAction();
    }
  }, [state?.availableVersion, state?.status]);

  if (!state?.canSelfUpdate || !new Set(["available", "downloading", "downloaded", "installing"]).has(state.status)) {
    return null;
  }

  const versionComparison = state.availableVersion
    ? `${state.currentVersion ?? "?"} → ${state.availableVersion}`
    : state.currentVersion;
  const label = `${stateMessage(t, state)}${versionComparison ? ` (${versionComparison})` : ""}`;
  return (
    <IconButton
      className={`sidebar-update-button is-${state.status}`}
      label={label}
      disabled={busy}
      onClick={performAction}
    >
      {state.status === "downloading" || state.status === "installing"
        ? <CircleNotch className="spin" aria-hidden="true" />
        : state.status === "downloaded"
          ? <CheckCircle weight="fill" aria-hidden="true" />
          : <DownloadSimple aria-hidden="true" />}
      {state.status === "downloading" ? (
        <span className="sidebar-update-percent" aria-hidden="true">{Math.round(state.progress ?? 0)}</span>
      ) : null}
    </IconButton>
  );
}

export function SoftwareUpdateSection({ updateBridge }) {
  const { action, busy, performAction, state, t } = useSoftwareUpdate(updateBridge);
  return (
    <section className="settings-section update-section">
      <div className="setting-row">
        <div>
          <h2>{t("settings.updates.title")}</h2>
          <p>{t("settings.updates.description")}</p>
        </div>
        {state?.currentVersion ? (
          <span className="update-version">{t("settings.updates.version", {
            version: state.currentVersion,
          })}</span>
        ) : null}
      </div>
      <div
        className={`update-status ${state?.status === "error" ? "error" : ""}`}
        role={state?.status === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {stateIcon(state)}
        <span>{stateMessage(t, state)}</span>
        {busy ? <ArrowsClockwise className="spin" aria-hidden="true" /> : null}
      </div>
      {state?.status === "downloading" ? (
        <progress
          className="update-progress"
          max="100"
          value={state.progress ?? 0}
          aria-label={t("settings.updates.progress")}
        />
      ) : null}
      {action ? (
        <button
          className={state?.status === "downloaded" ? "primary-button" : "secondary-button"}
          type="button"
          disabled={busy}
          onClick={performAction}
        >
          {action.label}
        </button>
      ) : null}
    </section>
  );
}
