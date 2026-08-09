/* eslint-disable no-unused-vars -- JSX references are not marked as usage by the base config */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChartBar, FilmSlate, SpeakerHigh, SpinnerGap, TreeStructure } from "@phosphor-icons/react";

import { VERTICAL_ALIGNMENT, borderToCss, elementTransform, fillToCss, sanitizeSlideHtml } from "./slideMarkup.js";

// Slides beyond this distance from the current one keep their frame but skip their
// contents, so a two-hundred-slide deck opens as fast as a five-slide one.
const THUMBNAIL_RENDER_WINDOW = 8;

function positionStyle(element) {
  return {
    left: `${element.left}px`,
    top: `${element.top}px`,
    width: `${element.width}px`,
    height: `${element.height}px`,
    transform: elementTransform(element),
  };
}

function SlideText({ element }) {
  const html = useMemo(() => sanitizeSlideHtml(element.content), [element.content]);
  if (!html) return null;
  return (
    <div
      className="slide-text"
      style={{ justifyContent: VERTICAL_ALIGNMENT.get(element.vAlign) || "flex-start" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function SlideShape({ element }) {
  const background = fillToCss(element.fill);
  const border = borderToCss(element);
  const usesPath = Boolean(element.path && element.pathViewBox);
  return (
    <div className="slide-element slide-shape" style={positionStyle(element)}>
      {usesPath ? (
        <svg
          className="slide-shape-path"
          viewBox={`${element.pathViewBox.x} ${element.pathViewBox.y} ${element.pathViewBox.width} ${element.pathViewBox.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d={element.path}
            fill={element.strokeOnly ? "none" : (background || "transparent")}
            stroke={element.borderWidth ? element.borderColor : "none"}
            strokeWidth={element.borderWidth || 0}
            strokeDasharray={element.borderStrokeDasharray || undefined}
          />
        </svg>
      ) : (
        <div className="slide-shape-box" style={{ background: background || undefined, border }} />
      )}
      <SlideText element={element} />
    </div>
  );
}

function SlideImage({ element }) {
  const source = element.base64 || element.blob;
  if (!source) return null;
  return (
    <div className="slide-element slide-image" style={positionStyle(element)}>
      <img src={source} alt="" draggable="false" style={{ border: borderToCss(element) }} />
    </div>
  );
}

function SlideTable({ element }) {
  return (
    <div className="slide-element slide-table" style={positionStyle(element)}>
      <table>
        <tbody>
          {(element.data || []).map((row, rowIndex) => (
            <tr key={rowIndex} style={{ height: `${element.rowHeights?.[rowIndex] ?? 0}px` }}>
              {row.map((cell, columnIndex) => (
                cell.hMerge || cell.vMerge ? null : (
                  <td
                    key={columnIndex}
                    rowSpan={cell.rowSpan || undefined}
                    colSpan={cell.colSpan || undefined}
                    style={{
                      width: `${element.colWidths?.[columnIndex] ?? 0}px`,
                      background: cell.fillColor || undefined,
                      color: cell.fontColor || undefined,
                      fontWeight: cell.fontBold ? 700 : undefined,
                      verticalAlign: cell.vAlign === "mid" ? "middle" : cell.vAlign === "down" ? "bottom" : "top",
                      borderTop: cell.borders?.top ? `${cell.borders.top.borderWidth}px ${cell.borders.top.borderType} ${cell.borders.top.borderColor}` : undefined,
                      borderBottom: cell.borders?.bottom ? `${cell.borders.bottom.borderWidth}px ${cell.borders.bottom.borderType} ${cell.borders.bottom.borderColor}` : undefined,
                      borderLeft: cell.borders?.left ? `${cell.borders.left.borderWidth}px ${cell.borders.left.borderType} ${cell.borders.left.borderColor}` : undefined,
                      borderRight: cell.borders?.right ? `${cell.borders.right.borderWidth}px ${cell.borders.right.borderType} ${cell.borders.right.borderColor}` : undefined,
                    }}
                    dangerouslySetInnerHTML={{ __html: sanitizeSlideHtml(cell.text) }}
                  />
                )
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Charts, media, and SmartArt are real slide content this preview does not draw. It
 * names what is there and keeps the block's footprint, so the layout the author built
 * still reads correctly instead of collapsing around a hole.
 */
function SlidePlaceholder({ element, label, icon }) {
  return (
    <div className="slide-element slide-placeholder" style={positionStyle(element)}>
      <span className="slide-placeholder-mark">{icon}<small>{label}</small></span>
    </div>
  );
}

function SlideElement({ element, t }) {
  switch (element.type) {
    case "text":
      return (
        <div className="slide-element slide-textbox" style={positionStyle(element)}>
          <div className="slide-shape-box" style={{ background: fillToCss(element.fill) || undefined, border: borderToCss(element) }} />
          <SlideText element={element} />
        </div>
      );
    case "shape":
      return <SlideShape element={element} />;
    case "image":
      return <SlideImage element={element} />;
    case "table":
      return <SlideTable element={element} />;
    case "group":
      return (
        <div className="slide-element slide-group" style={positionStyle(element)}>
          {(element.elements || []).map((child, index) => (
            <SlideElement key={`${child.type}-${index}`} element={child} t={t} />
          ))}
        </div>
      );
    case "diagram":
      return (
        <div className="slide-element slide-group" style={positionStyle(element)}>
          {(element.elements || []).map((child, index) => (
            <SlideElement key={`${child.type}-${index}`} element={child} t={t} />
          ))}
        </div>
      );
    case "chart":
      return <SlidePlaceholder element={element} label={t("slides.chart")} icon={<ChartBar />} />;
    case "video":
      return <SlidePlaceholder element={element} label={t("slides.video")} icon={<FilmSlate />} />;
    case "audio":
      return <SlidePlaceholder element={element} label={t("slides.audio")} icon={<SpeakerHigh />} />;
    case "math":
      return (
        <div className="slide-element slide-math" style={positionStyle(element)}>
          {element.picBase64 ? <img src={element.picBase64} alt={element.text || ""} /> : <code>{element.latex || element.text}</code>}
        </div>
      );
    default:
      return <SlidePlaceholder element={element} label={t("slides.unsupportedElement")} icon={<TreeStructure />} />;
  }
}

function SlideCanvas({ slide, size, scale, t, label, className = "" }) {
  return (
    <div
      className={`slide-canvas ${className}`}
      role="img"
      aria-label={label}
      style={{ width: `${size.width * scale}px`, height: `${size.height * scale}px` }}
    >
      <div
        className="slide-canvas-inner"
        style={{
          width: `${size.width}px`,
          height: `${size.height}px`,
          transform: `scale(${scale})`,
          background: fillToCss(slide.fill) || "#ffffff",
        }}
      >
        {(slide.layoutElements || []).map((element, index) => (
          <SlideElement key={`layout-${index}`} element={element} t={t} />
        ))}
        {(slide.elements || []).map((element, index) => (
          <SlideElement key={`element-${index}`} element={element} t={t} />
        ))}
      </div>
    </div>
  );
}

/**
 * Presentation preview.
 *
 * pptxtojson resolves the OOXML into positioned elements; this surface lays them out
 * on a fixed slide canvas and scales the whole canvas to the viewport, so one scale
 * factor governs every element and nothing drifts out of the author's composition.
 */
export function SlidePreview({
  item,
  loadData,
  slideIndex,
  onSlideIndex,
  onSlideCount,
  onMetadata,
  onError,
  notesOpen,
}) {
  const { t } = useTranslation();
  const stageRef = useRef(null);
  const [deck, setDeck] = useState(null);
  const [status, setStatus] = useState("loading");
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let disposed = false;
    setStatus("loading");
    setDeck(null);
    Promise.all([import("pptxtojson"), loadData?.()])
      .then(async ([pptx, data]) => {
        if (disposed) return;
        if (!data) throw new Error("EMPTY_PRESENTATION");
        const buffer = data.buffer instanceof ArrayBuffer && data.byteLength === data.buffer.byteLength
          ? data.buffer
          : data.slice().buffer;
        const parsed = await pptx.parse(buffer, { imageMode: "base64", videoMode: "none", audioMode: "none" });
        if (disposed) return;
        setDeck(parsed);
        setStatus("ready");
        onSlideCount(parsed.slides.length);
        onMetadata(t("slides.slideCount", { count: parsed.slides.length }));
      })
      .catch(() => {
        if (disposed) return;
        setStatus("error");
        onError();
      });
    return () => {
      disposed = true;
    };
  }, [loadData, onError, onMetadata, onSlideCount, t]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return undefined;
    const measure = () => setStageSize((current) => (
      current.width === element.clientWidth && current.height === element.clientHeight
        ? current
        : { width: element.clientWidth, height: element.clientHeight }
    ));
    measure();
    const observer = typeof window.ResizeObserver === "function" ? new window.ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [status]);

  const size = deck?.size?.width ? deck.size : { width: 960, height: 540 };
  const scale = stageSize.width && stageSize.height
    ? Math.min((stageSize.width - 48) / size.width, (stageSize.height - 48) / size.height)
    : 0;

  if (status === "loading") {
    return (
      <div className="slide-preview-state" role="status">
        <SpinnerGap className="spin" />
        <p>{t("slides.opening")}</p>
      </div>
    );
  }

  const slides = deck?.slides ?? [];
  const current = slides[slideIndex] ?? slides[0] ?? null;
  const notes = current?.note?.trim() || "";

  return (
    <div className="slide-preview" data-testid="slide-preview">
      <nav className="slide-rail" aria-label={t("slides.railLabel")}>
        <ol>
          {slides.map((slide, index) => (
            <li key={index}>
              <button
                type="button"
                className={`slide-thumb${index === slideIndex ? " is-current" : ""}`}
                aria-current={index === slideIndex ? "true" : undefined}
                aria-label={t("slides.goToSlide", { number: index + 1 })}
                onClick={() => onSlideIndex(index)}
              >
                <span className="slide-thumb-number">{index + 1}</span>
                <span className="slide-thumb-frame" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
                  {Math.abs(index - slideIndex) <= THUMBNAIL_RENDER_WINDOW ? (
                    <SlideCanvas
                      slide={slide}
                      size={size}
                      scale={132 / size.width}
                      t={t}
                      className="is-thumb"
                      label={t("slides.thumbLabel", { number: index + 1 })}
                    />
                  ) : (
                    <span className="slide-thumb-fill" style={{ background: fillToCss(slide.fill) || "#ffffff" }} />
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="slide-main">
        <div ref={stageRef} className="slide-stage">
          {current && scale > 0 ? (
            <SlideCanvas
              slide={current}
              size={size}
              scale={scale}
              t={t}
              label={t("slides.slideLabel", { number: slideIndex + 1, title: item.title })}
            />
          ) : null}
        </div>
        {notesOpen ? (
          <aside className="slide-notes" aria-label={t("slides.notesLabel")}>
            <h3>{t("slides.notes")}</h3>
            {notes ? <p>{notes}</p> : <p className="slide-notes-empty">{t("slides.noNotes")}</p>}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
