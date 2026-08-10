/* eslint-disable no-unused-vars -- JSX references are not marked as usage by the base config */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowSquareOut, FolderOpen } from "@phosphor-icons/react";

import { fileExtension } from "./officeFormats.js";

/**
 * Word 97-2003 and its siblings are binary formats, not the zipped XML the modern
 * ones use, and nothing in a browser can read them. Rather than showing a failure,
 * this state says what the file is and hands over the two actions that actually work.
 */
export function LegacyOfficePreview({ item, onOpenExternally, onReveal }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const extension = fileExtension(item.path || item.name || item.title).toUpperCase();
  const modernFormat = { DOC: ".docx", XLS: ".xlsx", PPT: ".pptx" }[extension] ?? null;

  return (
    <div className="legacy-office-state" data-testid="legacy-office-preview">
      <p className="legacy-office-format">{extension}</p>
      <h2>{t("legacyOffice.title", { format: extension })}</h2>
      <p>
        {modernFormat
          ? t("legacyOffice.body", { format: extension, modern: modernFormat })
          : t("legacyOffice.bodyGeneric", { format: extension })}
      </p>
      <div className="legacy-office-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setFailed(false);
            Promise.resolve(onOpenExternally?.()).catch(() => setFailed(true));
          }}
        >
          <ArrowSquareOut /> {t("legacyOffice.openExternally")}
        </button>
        <button type="button" onClick={() => onReveal?.()}>
          <FolderOpen /> {t("editor.showFinder")}
        </button>
      </div>
      {failed ? <p className="legacy-office-error" role="alert">{t("legacyOffice.openFailed")}</p> : null}
    </div>
  );
}
