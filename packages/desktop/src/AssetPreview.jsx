/* eslint-disable no-unused-vars -- JSX references are not marked as usage by the base config */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowsInSimple,
  ArrowsOutSimple,
  CaretLeft,
  CaretRight,
  FileDoc,
  FileImage,
  FilePdf,
  FilePpt,
  FileXls,
  FolderOpen,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  DotsThree,
  Notepad,
  SpinnerGap,
  Video,
  WarningCircle,
} from "@phosphor-icons/react";
import { ContentSurface } from "./ContentSurface.jsx";
import { IconButton } from "./design-system/index.js";
import {
  MAXIMUM_IMAGE_ZOOM,
  MINIMUM_IMAGE_ZOOM,
  anchoredScrollPosition,
  clampImageZoom,
  imageZoomFromWheel,
} from "./imagePreviewNavigation.js";
import { LegacyOfficePreview } from "./preview/LegacyOfficePreview.jsx";
import { SheetPreview } from "./preview/SheetPreview.jsx";
import { SlidePreview } from "./preview/SlidePreview.jsx";
import { WordPreview } from "./preview/WordPreview.jsx";
import { isLegacyOfficeItem, isOfficeKind } from "./preview/officeFormats.js";
import { useWorkbook } from "./preview/useWorkbook.js";
import { useDismissibleLayer } from "./useDismissibleLayer.js";

const ZOOM_RANGES = {
  pdf: { minimum: 0.6, maximum: 2.5, step: 0.15, fit: 1.1 },
  word: { minimum: 0.5, maximum: 2.4, step: 0.1, fit: 1 },
};

const TYPE_ICONS = {
  image: <FileImage />,
  video: <Video />,
  pdf: <FilePdf />,
  word: <FileDoc />,
  excel: <FileXls />,
  powerpoint: <FilePpt />,
};

function formatBytes(bytes, notAvailable) {
  if (!Number.isFinite(bytes) || bytes <= 0) return notAvailable;
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function PreviewError({ item }) {
  const { t } = useTranslation();
  return (
    <div className="asset-preview-state" role="alert">
      <WarningCircle />
      <h2>{t("asset.previewFailed", { title: item.title })}</h2>
      <p>{t("asset.safe")}</p>
    </div>
  );
}

function stageGeometry(stage, zoom) {
  return {
    zoom,
    scrollLeft: stage.scrollLeft,
    scrollTop: stage.scrollTop,
    scrollWidth: stage.scrollWidth,
    scrollHeight: stage.scrollHeight,
    viewportWidth: stage.clientWidth,
    viewportHeight: stage.clientHeight,
  };
}

function ImagePreview({ item, src, zoom, onZoom, onMetadata, onError }) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const geometryRef = useRef(null);
  const pendingAnchorRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState(null);
  const [viewportSize, setViewportSize] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setNaturalSize(null);
    setViewportSize(null);
    setDragging(false);
    dragRef.current = null;
    geometryRef.current = null;
    pendingAnchorRef.current = null;
    if (stageRef.current) {
      stageRef.current.scrollLeft = 0;
      stageRef.current.scrollTop = 0;
    }
  }, [src]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measure = () => {
      const styles = window.getComputedStyle(stage);
      const horizontalPadding = Number.parseFloat(styles.paddingLeft || "0") + Number.parseFloat(styles.paddingRight || "0");
      const verticalPadding = Number.parseFloat(styles.paddingTop || "0") + Number.parseFloat(styles.paddingBottom || "0");
      const next = {
        width: Math.max(0, stage.clientWidth - horizontalPadding),
        height: Math.max(0, stage.clientHeight - verticalPadding),
      };
      setViewportSize((current) => (
        current?.width === next.width && current?.height === next.height ? current : next
      ));
    };
    measure();
    const observer = typeof window.ResizeObserver === "function" ? new window.ResizeObserver(measure) : null;
    observer?.observe(stage);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const handleWheel = (event) => {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return;
      event.preventDefault();
      const bounds = stage.getBoundingClientRect();
      pendingAnchorRef.current = {
        geometry: stageGeometry(stage, zoom),
        anchor: {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        },
      };
      onZoom(imageZoomFromWheel(zoom, event.deltaY));
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [onZoom, zoom]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const nextGeometry = stageGeometry(stage, zoom);
    const previousGeometry = pendingAnchorRef.current?.geometry || geometryRef.current;
    if (previousGeometry && previousGeometry.zoom !== zoom) {
      const anchor = pendingAnchorRef.current?.anchor || {
        x: previousGeometry.viewportWidth / 2,
        y: previousGeometry.viewportHeight / 2,
      };
      const nextScroll = anchoredScrollPosition({
        anchorX: anchor.x,
        anchorY: anchor.y,
        previousScrollLeft: previousGeometry.scrollLeft,
        previousScrollTop: previousGeometry.scrollTop,
        previousScrollWidth: previousGeometry.scrollWidth,
        previousScrollHeight: previousGeometry.scrollHeight,
        nextScrollWidth: nextGeometry.scrollWidth,
        nextScrollHeight: nextGeometry.scrollHeight,
        viewportWidth: nextGeometry.viewportWidth,
        viewportHeight: nextGeometry.viewportHeight,
      });
      stage.scrollLeft = nextScroll.left;
      stage.scrollTop = nextScroll.top;
    }
    pendingAnchorRef.current = null;
    geometryRef.current = stageGeometry(stage, zoom);
  }, [naturalSize, viewportSize, zoom]);

  let imageStyle = { maxWidth: "100%", maxHeight: "100%" };
  if (naturalSize && viewportSize?.width && viewportSize?.height) {
    const fitScale = Math.min(
      viewportSize.width / naturalSize.width,
      viewportSize.height / naturalSize.height,
      1,
    );
    const scale = fitScale * (zoom / 100);
    const width = Math.max(1, Math.round(naturalSize.width * scale * 100) / 100);
    const height = Math.max(1, Math.round(naturalSize.height * scale * 100) / 100);
    imageStyle = {
      width: `${width}px`,
      height: `${height}px`,
    };
  }

  const finishDrag = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={stageRef}
      className={`image-preview-stage ${zoom > 100 ? "is-pannable" : ""} ${dragging ? "is-dragging" : ""}`}
      data-testid="image-preview"
      data-zoom={Math.round(zoom * 10) / 10}
      onScroll={(event) => {
        geometryRef.current = stageGeometry(event.currentTarget, zoom);
      }}
      onPointerDown={(event) => {
        const stage = event.currentTarget;
        const canPan = stage.scrollWidth > stage.clientWidth + 1 || stage.scrollHeight > stage.clientHeight + 1;
        if (event.button !== 0 || !canPan) return;
        event.preventDefault();
        stage.setPointerCapture?.(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          pointerX: event.clientX,
          pointerY: event.clientY,
          scrollLeft: stage.scrollLeft,
          scrollTop: stage.scrollTop,
        };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        const stage = event.currentTarget;
        stage.scrollLeft = drag.scrollLeft - (event.clientX - drag.pointerX);
        stage.scrollTop = drag.scrollTop - (event.clientY - drag.pointerY);
        geometryRef.current = stageGeometry(stage, zoom);
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <div
        className="image-preview-canvas"
        style={viewportSize ? {
          minWidth: `${viewportSize.width}px`,
          minHeight: `${viewportSize.height}px`,
        } : undefined}
      >
        <img
          src={src}
          alt={item.title}
          draggable="false"
          style={imageStyle}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            setNaturalSize({ width: naturalWidth, height: naturalHeight });
            onMetadata(`${naturalWidth} × ${naturalHeight} px`);
          }}
          onError={onError}
        />
      </div>
    </div>
  );
}

function VideoPreview({ item, src, onMetadata, onError }) {
  const { t } = useTranslation();
  return (
    <div className="video-preview-stage" data-testid="video-preview">
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        aria-label={t("asset.videoPreview", { title: item.title })}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          const duration = Number.isFinite(video.duration) ? `${Math.floor(video.duration / 60)}:${String(Math.floor(video.duration % 60)).padStart(2, "0")}` : null;
          onMetadata([`${video.videoWidth} × ${video.videoHeight} px`, duration].filter(Boolean).join(" · "));
        }}
        onError={onError}
      />
    </div>
  );
}

function PdfPreview({ item, src, loadData, pageNumber, scale, onPageCount, onMetadata, onError }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [pdf, setPdf] = useState(null);

  useEffect(() => {
    if (!src) {
      setStatus("error");
      return undefined;
    }
    let disposed = false;
    let loadingTask;
    setStatus("loading");
    Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      loadData?.() ?? null,
    ]).then(([pdfjs, worker, data]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      loadingTask = pdfjs.getDocument(data ? { data } : { url: src });
      return loadingTask.promise;
    }).then((nextPdf) => {
      if (disposed) return;
      setPdf(nextPdf);
      onPageCount(nextPdf.numPages);
      onMetadata(t("asset.pageCount", { count: nextPdf.numPages }));
    }).catch(() => {
      if (!disposed) {
        setStatus("error");
        onError();
      }
    });
    return () => {
      disposed = true;
      void loadingTask?.destroy();
    };
  }, [loadData, onError, onMetadata, onPageCount, src]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return undefined;
    let disposed = false;
    let renderTask;
    setStatus("loading");
    pdf.getPage(pageNumber).then((page) => {
      if (disposed || !canvasRef.current) return;
      const viewport = page.getViewport({ scale });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d", { alpha: false });
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
      });
      return renderTask.promise;
    }).then(() => {
      if (!disposed) setStatus("ready");
    }).catch((error) => {
      if (!disposed && error?.name !== "RenderingCancelledException") {
        setStatus("error");
        onError();
      }
    });
    return () => {
      disposed = true;
      renderTask?.cancel();
    };
  }, [onError, pageNumber, pdf, scale]);

  if (status === "error") return <PreviewError item={item} />;
  return (
    <div className="pdf-preview-stage" data-testid="pdf-preview">
      {status === "loading" ? <div className="preview-loading"><SpinnerGap className="spin" /><span>{t("asset.renderingPage", { page: pageNumber })}</span></div> : null}
      <canvas ref={canvasRef} aria-label={t("asset.pageOf", { page: pageNumber, title: item.title })} />
    </div>
  );
}

function PreviewSaveState({ state, dirty, t }) {
  if (state === "saving") return <span className="preview-save-state is-busy" role="status"><SpinnerGap className="spin" />{t("sheet.saving")}</span>;
  if (state === "saved" && !dirty) return <span className="preview-save-state is-saved" role="status">{t("sheet.saved")}</span>;
  if (state === "conflict") return <span className="preview-save-state is-warning" role="status">{t("sheet.conflict")}</span>;
  if (state === "failed") return <span className="preview-save-state is-warning" role="status">{t("sheet.saveFailed")}</span>;
  if (dirty) return <span className="preview-save-state" role="status">{t("sheet.unsaved")}</span>;
  return null;
}

function SheetTabs({ workbook, activeSheet, onSelect, editedSheets, t }) {
  if (!workbook?.sheets?.length) return null;
  return (
    <div className="sheet-tabs" role="tablist" aria-label={t("sheet.tabsLabel")}>
      {workbook.sheets.map((sheet, index) => (
        <button
          key={`${sheet.id}-${sheet.name}`}
          type="button"
          role="tab"
          id={`sheet-tab-${index}`}
          aria-selected={index === activeSheet}
          tabIndex={index === activeSheet ? 0 : -1}
          className={`sheet-tab${index === activeSheet ? " is-active" : ""}${sheet.hidden ? " is-hidden-sheet" : ""}`}
          onClick={() => onSelect(index)}
        >
          {sheet.name}
          {editedSheets.has(sheet.name) ? <span className="sheet-tab-dot" aria-label={t("sheet.hasUnsaved")} /> : null}
        </button>
      ))}
    </div>
  );
}

export function AssetPreview({ item, src, loadData, onBack, onReveal, onOpenExternally, readWorkbook, saveWorkbook }) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(100);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [metadata, setMetadata] = useState("");
  const [failed, setFailed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const previewRef = useRef(null);
  const detailsMenuRef = useRef(null);
  // The parent passes these as inline arrows, so they change identity on every render.
  // Holding them in refs keeps the surfaces bound to the item rather than to the prop,
  // which is what stops a routine parent re-render from restarting a parse or, worse,
  // reloading a workbook out from under unsaved edits.
  const loadDataRef = useRef(loadData);
  const readWorkbookRef = useRef(readWorkbook);
  const saveWorkbookRef = useRef(saveWorkbook);
  const itemRef = useRef(item);
  loadDataRef.current = loadData;
  readWorkbookRef.current = readWorkbook;
  saveWorkbookRef.current = saveWorkbook;
  itemRef.current = item;

  const legacy = isLegacyOfficeItem(item);
  const isOffice = isOfficeKind(item.type);
  const zoomRange = ZOOM_RANGES[item.type] ?? null;

  const handleFailure = useCallback(() => setFailed(true), []);
  // Bound to the item rather than to the prop so a parent re-render never restarts a
  // parse that is already in flight.
  const readBytes = useCallback(() => loadDataRef.current?.() ?? null, [item.id]);
  const readWorkbookForItem = useCallback(() => readWorkbookRef.current?.(itemRef.current), [item.id]);
  const saveWorkbookForItem = useCallback((input) => saveWorkbookRef.current?.(itemRef.current, input), [item.id]);

  const sheets = useWorkbook({
    item,
    enabled: item.type === "excel" && !legacy && typeof readWorkbook === "function",
    readWorkbook: readWorkbookForItem,
    saveWorkbook: saveWorkbookForItem,
  });

  useDismissibleLayer({
    open: detailsOpen,
    onDismiss: () => setDetailsOpen(false),
    insideRefs: [detailsMenuRef],
    restoreFocusRef: detailsMenuRef,
  });

  useEffect(() => {
    setZoom(ZOOM_RANGES[item.type]?.fit ?? 100);
    setPageNumber(1);
    setPageCount(0);
    setSlideIndex(0);
    setSlideCount(0);
    setNotesOpen(false);
    setMetadata("");
    setFailed(false);
    setDetailsOpen(false);
  }, [item.id, item.type]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(window.document.fullscreenElement === previewRef.current);
    };
    window.document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => window.document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Arrow keys drive a deck the way they drive every other presentation tool. The grid
  // owns its own arrows, so slides are the only surface that claims them here.
  useEffect(() => {
    if (item.type !== "powerpoint" || legacy || slideCount < 2) return undefined;
    const handleKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof window.HTMLElement && target.closest("input, textarea, [contenteditable='true']")) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        setSlideIndex((index) => Math.min(slideCount - 1, index + 1));
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setSlideIndex((index) => Math.max(0, index - 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [item.type, legacy, slideCount]);

  const canZoom = !legacy && (item.type === "image" || Boolean(zoomRange));
  const typeLabel = t(`asset.${item.type}`, { defaultValue: t("library.file") });
  const metadataLabel = item.type === "pdf" || item.type === "word"
    ? t("asset.pages")
    : item.type === "powerpoint"
      ? t("slides.slides")
      : item.type === "excel"
        ? t("sheet.sheets")
        : item.type === "video"
          ? t("asset.duration")
          : t("asset.dimensions");
  const zoomLabel = zoomRange ? `${Math.round(zoom * 100)}%` : `${Math.round(zoom)}%`;
  const zoomOut = () => setZoom((value) => (zoomRange
    ? Math.max(zoomRange.minimum, Math.round((value - zoomRange.step) * 100) / 100)
    : clampImageZoom(value - 10)));
  const zoomIn = () => setZoom((value) => (zoomRange
    ? Math.min(zoomRange.maximum, Math.round((value + zoomRange.step) * 100) / 100)
    : clampImageZoom(value + 10)));
  const fit = () => setZoom(zoomRange?.fit ?? 100);

  const editedSheets = useMemo(() => {
    const names = new Set();
    for (const edit of sheets.edits.values()) names.add(edit.sheet);
    for (const operation of sheets.operations) names.add(operation.sheet);
    return names;
  }, [sheets.edits, sheets.operations]);

  const workbookMetadata = sheets.workbook?.sheets?.length
    ? t("sheet.sheetCount", { count: sheets.workbook.sheets.length })
    : "";
  const shownMetadata = item.type === "excel" ? workbookMetadata : metadata;

  async function toggleFullscreen() {
    if (window.document.fullscreenElement === previewRef.current) {
      await window.document.exitFullscreen?.();
      return;
    }
    await previewRef.current?.requestFullscreen?.({ navigationUI: "hide" });
  }

  const showsSurface = !failed && !legacy;

  return (
    <ContentSurface.Root surfaceRef={previewRef} className={`asset-preview-screen ${item.type}`} label={t("asset.previewing", { title: item.title })}>
      <ContentSurface.Header className="preview-toolbar">
        <div className="toolbar-title">
          <IconButton label={t("asset.back")} onClick={onBack}><ArrowLeft /></IconButton>
          {TYPE_ICONS[item.type] ?? <FilePdf />}
          <span className="document-path">{item.path}</span>
        </div>
        <div className="toolbar-actions">
          {item.type === "excel" && !legacy ? (
            <>
              <PreviewSaveState state={sheets.saveState} dirty={sheets.dirty} t={t} />
              {sheets.dirty ? (
                <>
                  <button type="button" className="preview-text-button" onClick={sheets.discard}>{t("sheet.discard")}</button>
                  <button
                    type="button"
                    className="preview-text-button is-primary"
                    disabled={sheets.saveState === "saving"}
                    onClick={() => void sheets.save()}
                  >{t("sheet.save")}</button>
                </>
              ) : null}
              {sheets.saveState === "conflict" ? (
                <IconButton label={t("sheet.reload")} onClick={() => void sheets.reload()}><ArrowClockwise /></IconButton>
              ) : null}
            </>
          ) : null}
          {canZoom ? (
            <div className="preview-zoom" aria-label={t("asset.zoomControls")}>
              <IconButton
                label={t("asset.zoomOut")}
                disabled={zoomRange ? zoom <= zoomRange.minimum : zoom <= MINIMUM_IMAGE_ZOOM}
                onClick={zoomOut}
              ><MagnifyingGlassMinus /></IconButton>
              <button type="button" className="preview-zoom-level" aria-label={t("asset.fit")} title={t("asset.fit")} onClick={fit}>{zoomLabel}</button>
              <IconButton
                label={t("asset.zoomIn")}
                disabled={zoomRange ? zoom >= zoomRange.maximum : zoom >= MAXIMUM_IMAGE_ZOOM}
                onClick={zoomIn}
              ><MagnifyingGlassPlus /></IconButton>
            </div>
          ) : null}
          {item.type === "pdf" && !legacy ? (
            <div className="preview-pages" aria-label={t("asset.pageControls")}>
              <IconButton label={t("asset.previousPage")} disabled={pageNumber <= 1} onClick={() => setPageNumber((page) => Math.max(1, page - 1))}><CaretLeft /></IconButton>
              <span>{pageNumber} / {pageCount || "…"}</span>
              <IconButton label={t("asset.nextPage")} disabled={!pageCount || pageNumber >= pageCount} onClick={() => setPageNumber((page) => Math.min(pageCount, page + 1))}><CaretRight /></IconButton>
            </div>
          ) : null}
          {item.type === "powerpoint" && !legacy ? (
            <>
              <IconButton
                label={t("slides.toggleNotes")}
                aria-pressed={notesOpen}
                onClick={() => setNotesOpen((open) => !open)}
              ><Notepad weight={notesOpen ? "fill" : "regular"} /></IconButton>
              <div className="preview-pages" aria-label={t("slides.slideControls")}>
                <IconButton label={t("slides.previousSlide")} disabled={slideIndex <= 0} onClick={() => setSlideIndex((index) => Math.max(0, index - 1))}><CaretLeft /></IconButton>
                <span>{slideCount ? slideIndex + 1 : "…"} / {slideCount || "…"}</span>
                <IconButton label={t("slides.nextSlide")} disabled={!slideCount || slideIndex >= slideCount - 1} onClick={() => setSlideIndex((index) => Math.min(slideCount - 1, index + 1))}><CaretRight /></IconButton>
              </div>
            </>
          ) : null}
          <IconButton
            label={t(fullscreen ? "asset.exitFullscreen" : "asset.enterFullscreen")}
            aria-pressed={fullscreen}
            onClick={() => void toggleFullscreen().catch(() => {})}
          >{fullscreen ? <ArrowsInSimple /> : <ArrowsOutSimple />}</IconButton>
          <div ref={detailsMenuRef} className="menu-wrap preview-menu-wrap">
            <IconButton
              label={t("asset.more")}
              aria-expanded={detailsOpen}
              aria-haspopup="dialog"
              onClick={() => setDetailsOpen((open) => !open)}
            ><DotsThree /></IconButton>
            {detailsOpen ? (
              <div className="popover preview-details-popover" role="dialog" aria-label={t("asset.detailsFor", { title: item.title })}>
                <p className="popover-label">{t("asset.details")}</p>
                <dl className="preview-details-list">
                  <div><dt>{t("asset.name")}</dt><dd>{item.title}</dd></div>
                  <div><dt>{t("asset.type")}</dt><dd>{typeLabel}</dd></div>
                  {shownMetadata ? <div><dt>{metadataLabel}</dt><dd>{shownMetadata}</dd></div> : null}
                  <div><dt>{t("asset.size")}</dt><dd>{formatBytes(item.size, t("common.notAvailable"))}</dd></div>
                  <div><dt>{t("asset.location")}</dt><dd>{item.path}</dd></div>
                </dl>
                <div className="preview-details-separator" />
                {isOffice && onOpenExternally ? (
                  <button onClick={() => { setDetailsOpen(false); void Promise.resolve(onOpenExternally()).catch(() => {}); }}>
                    <ArrowsOutSimple /> {t("legacyOffice.openExternally")}
                  </button>
                ) : null}
                <button onClick={() => { setDetailsOpen(false); onReveal(); }}><FolderOpen /> {t("editor.showFinder")}</button>
              </div>
            ) : null}
          </div>
        </div>
      </ContentSurface.Header>

      <ContentSurface.Panel className={`asset-preview-content ${item.type}`}>
        {legacy ? <LegacyOfficePreview item={item} onOpenExternally={onOpenExternally} onReveal={onReveal} /> : null}
        {!legacy && (failed || (!src && !isOffice)) ? <PreviewError item={item} /> : null}
        {showsSurface && src && item.type === "image" ? <ImagePreview item={item} src={src} zoom={zoom} onZoom={setZoom} onMetadata={setMetadata} onError={handleFailure} /> : null}
        {showsSurface && src && item.type === "video" ? <VideoPreview item={item} src={src} onMetadata={setMetadata} onError={handleFailure} /> : null}
        {showsSurface && src && item.type === "pdf" ? <PdfPreview item={item} src={src} loadData={readBytes} pageNumber={pageNumber} scale={zoom} onPageCount={setPageCount} onMetadata={setMetadata} onError={handleFailure} /> : null}
        {showsSurface && item.type === "word" ? <WordPreview item={item} loadData={readBytes} zoom={zoom} onMetadata={setMetadata} onError={handleFailure} onReady={({ pageCount: pages }) => setPageCount(pages)} /> : null}
        {showsSurface && item.type === "powerpoint" ? (
          <SlidePreview
            item={item}
            loadData={readBytes}
            slideIndex={slideIndex}
            onSlideIndex={setSlideIndex}
            onSlideCount={setSlideCount}
            onMetadata={setMetadata}
            onError={handleFailure}
            notesOpen={notesOpen}
          />
        ) : null}
        {showsSurface && item.type === "excel" ? (
          <>
            {sheets.status === "error" ? (
              <PreviewError item={item} />
            ) : (
              <SheetPreview
                workbook={sheets.workbook}
                activeSheet={sheets.activeSheet}
                edits={sheets.sheetEdits}
                onEditCell={sheets.editCell}
                onInsertRow={sheets.insertRow}
                onInsertColumn={sheets.insertColumn}
                status={sheets.status}
              />
            )}
            {sheets.saveState === "conflict" ? (
              <p className="sheet-conflict-note" role="alert">{t("sheet.conflictDetail")}</p>
            ) : null}
            {sheets.status === "ready" ? (
              <p className="sheet-fidelity-note" role="note">{t("sheet.fidelityNote")}</p>
            ) : null}
            <SheetTabs
              workbook={sheets.workbook}
              activeSheet={sheets.activeSheet}
              onSelect={sheets.setActiveSheet}
              editedSheets={editedSheets}
              t={t}
            />
          </>
        ) : null}
      </ContentSurface.Panel>
    </ContentSurface.Root>
  );
}
