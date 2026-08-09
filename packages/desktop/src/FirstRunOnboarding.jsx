/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import {
  ArrowRight,
  CheckCircle,
  FileImage,
  FilePdf,
  FileText,
  FileVideo,
  FolderOpen,
  LockKey,
  TreeStructure,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

import fyluneIcon from "../build/icon.png";

export function FirstRunOnboarding({
  busyAction = "",
  error = "",
  onCreateProject,
  onOpenProject,
}) {
  const { t } = useTranslation();
  const busy = Boolean(busyAction);

  return (
    <main className="first-run" aria-labelledby="first-run-title">
      <header className="first-run-brand">
        <img src={fyluneIcon} alt="" />
        <span>Fylune</span>
      </header>

      <div className="first-run-layout">
        <section className="first-run-intro">
          <div className="first-run-icon" aria-hidden="true"><FolderOpen weight="duotone" /></div>
          <h1 id="first-run-title">{t("onboarding.title")}</h1>
          <p>{t("onboarding.copy")}</p>
          <div className="first-run-actions">
            <button
              type="button"
              className="primary-button first-run-action"
              disabled={busy}
              onClick={onOpenProject}
            >
              <FolderOpen />
              {busyAction === "open" ? t("onboarding.opening") : t("onboarding.chooseFolder")}
              {!busy ? <ArrowRight /> : null}
            </button>
            <button
              type="button"
              className="first-run-create-action"
              disabled={busy}
              onClick={onCreateProject}
            >
              {busyAction === "create" ? t("onboarding.creatingWorkspace") : t("onboarding.createWorkspace")}
            </button>
          </div>
          {error ? <p className="first-run-error" role="alert">{error}</p> : null}
          <p className="first-run-privacy"><LockKey /> {t("onboarding.privacy")}</p>
        </section>

        <aside className="first-run-guide" aria-labelledby="first-run-guide-title">
          <div>
            <span className="first-run-guide-icon"><TreeStructure /></span>
            <h2 id="first-run-guide-title">{t("onboarding.guideTitle")}</h2>
            <p>{t("onboarding.guideCopy")}</p>
          </div>
          <ul>
            <li><FileText /><span><strong>{t("onboarding.documents")}</strong><small>Markdown · MDX</small></span><CheckCircle weight="fill" /></li>
            <li><FileImage /><span><strong>{t("onboarding.images")}</strong><small>PNG · JPG · WebP · GIF</small></span><CheckCircle weight="fill" /></li>
            <li><FileVideo /><span><strong>{t("onboarding.video")}</strong><small>MP4 · MOV · WebM</small></span><CheckCircle weight="fill" /></li>
            <li><FilePdf /><span><strong>{t("onboarding.pdf")}</strong><small>PDF</small></span><CheckCircle weight="fill" /></li>
          </ul>
        </aside>
      </div>
    </main>
  );
}
