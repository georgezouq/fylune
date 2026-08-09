import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const appUrl = process.env.FYLUNE_DEMO_URL || "http://127.0.0.1:5173";
const demoTheme = process.env.FYLUNE_DEMO_THEME === "dark" ? "dark" : "light";
const outputPath = path.resolve(process.argv[2] || "fylune-product-tour.webm");
const videoDir = await mkdtemp(path.join(tmpdir(), "fylune-product-demo-"));

await mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: demoTheme,
  recordVideo: {
    dir: videoDir,
    size: { width: 1600, height: 900 },
  },
});

await context.addInitScript((theme) => {
  window.localStorage.clear();
  window.localStorage.setItem("fylune-preferences", JSON.stringify({ theme }));

  const mountDemoCursor = () => {
    if (document.querySelector("#fylune-demo-cursor")) return;
    const recordingStyle = document.createElement("style");
    recordingStyle.id = "fylune-demo-recording-style";
    recordingStyle.textContent = ".external-banner, .structured-block { display: none !important; }";
    document.head.append(recordingStyle);

    const cursor = document.createElement("div");
    cursor.id = "fylune-demo-cursor";
    cursor.innerHTML = `
      <svg viewBox="0 0 30 38" aria-hidden="true">
        <path d="M3 2.5v29l7.3-7.1 5.2 10.8 5.2-2.6-5.1-10.5h10.1L3 2.5Z" fill="${theme === "dark" ? "#f3f7f5" : "#142229"}" stroke="${theme === "dark" ? "#142229" : "#fff"}" stroke-width="2.2" stroke-linejoin="round" />
      </svg>`;
    Object.assign(cursor.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "25px",
      height: "32px",
      zIndex: "2147483647",
      pointerEvents: "none",
      opacity: "0",
      filter: "drop-shadow(0 2px 3px rgba(8, 20, 24, 0.34))",
      transform: "translate(-3px, -2px)",
    });
    document.body.append(cursor);

    document.addEventListener("mousemove", (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
      cursor.style.opacity = "1";
    });

    document.addEventListener("mousedown", (event) => {
      const ring = document.createElement("div");
      Object.assign(ring.style, {
        position: "fixed",
        left: `${event.clientX}px`,
        top: `${event.clientY}px`,
        width: "38px",
        height: "38px",
        zIndex: "2147483646",
        pointerEvents: "none",
        border: "2px solid rgba(23, 137, 92, 0.72)",
        borderRadius: "999px",
      });
      document.body.append(ring);
      const animation = ring.animate([
        { opacity: 0.82, transform: "translate(-50%, -50%) scale(0.32)" },
        { opacity: 0, transform: "translate(-50%, -50%) scale(1.18)" },
      ], { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      animation.finished.finally(() => ring.remove());
    });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountDemoCursor, { once: true });
  else mountDemoCursor();
}, demoTheme);

const page = await context.newPage();
const video = page.video();

async function pause(milliseconds) {
  await page.waitForTimeout(milliseconds);
}

async function moveTo(locator, { xOffset = 0, yOffset = 0, steps = 30 } = {}) {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Could not locate ${await locator.getAttribute("aria-label") || "recording target"}`);
  await page.mouse.move(box.x + box.width / 2 + xOffset, box.y + box.height / 2 + yOffset, { steps });
  await pause(260);
}

async function moveAndClick(locator, options) {
  await moveTo(locator, options);
  await page.mouse.down();
  await pause(90);
  await page.mouse.up();
}

try {
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.locator(".fylune-app").waitFor({ state: "visible" });
  await page.mouse.move(1120, 770, { steps: 18 });
  await pause(1500);

  await moveAndClick(page.getByRole("button", { name: "New document" }).first());
  const title = page.getByRole("textbox", { name: "Document title" });
  await title.waitFor({ state: "visible" });
  await pause(900);

  await moveAndClick(title, { xOffset: -60 });
  await page.keyboard.press("Meta+A");
  await page.keyboard.type("Fylune launch notes", { delay: 74 });
  await pause(650);
  await page.keyboard.press("Enter");
  await pause(380);

  const editor = page.getByRole("textbox", { name: "editable markdown" });
  await editor.waitFor({ state: "visible" });
  await page.keyboard.press("Meta+A");
  await page.keyboard.type("Today we're shipping a calmer way to work with local documents.", { delay: 38 });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Create, edit, and move between files without leaving your project.", { delay: 34 });
  await pause(1700);

  const allTab = page.getByRole("tab", { name: "All" });
  await moveAndClick(allTab);
  await page.getByRole("heading", { name: "All documents" }).waitFor({ state: "visible" });
  await pause(1100);

  const productBrief = page.getByRole("button", { name: "Open Product brief" });
  await moveAndClick(productBrief, { yOffset: -20 });
  await page.getByRole("region", { name: "Editing Product brief" }).waitFor({ state: "visible" });
  await pause(1300);

  const roadmap = page.getByRole("treeitem", { name: "Launch roadmap.md" });
  await moveAndClick(roadmap);
  await page.getByRole("region", { name: "Editing Launch roadmap" }).waitFor({ state: "visible" });
  await pause(1300);

  const productTab = page.getByRole("tab", { name: "Product brief" });
  await moveAndClick(productTab);
  await page.getByRole("region", { name: "Editing Product brief" }).waitFor({ state: "visible" });
  await page.mouse.move(1230, 770, { steps: 24 });
  await pause(1700);
} finally {
  await context.close();
  await video.saveAs(outputPath);
  await browser.close();
  await rm(videoDir, { recursive: true, force: true });
}

console.log(`Recorded Fylune product demo to ${outputPath}`);
