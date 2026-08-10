/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FolderCard, WorkspaceAssetCard } from "../../src/App.jsx";

const previewPixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("workspace visual preview cards", () => {
  it("renders an image file as a proportional image instead of a type placeholder", () => {
    const { container } = render(
      <WorkspaceAssetCard
        item={{
          id: "asset-preview",
          title: "preview.png",
          name: "preview.png",
          path: "assets/preview.png",
          type: "image",
          previewUrl: previewPixel,
        }}
        view="grid"
        onOpen={vi.fn()}
      />,
    );

    const preview = container.querySelector(".workspace-file-preview.image.has-visual");
    const image = preview?.querySelector("img");
    expect(image).toBeInTheDocument();
    expect(container.querySelector(".workspace-file-preview.image > svg")).not.toBeInTheDocument();
    expect(container.querySelector(".workspace-file-copy strong")).toHaveTextContent("preview.png");
    expect(container.querySelector(".workspace-file-copy small")).not.toBeInTheDocument();

    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 900 },
    });
    fireEvent.load(image);
    expect(preview.style.getPropertyValue("--image-aspect-ratio")).toBe(String(1600 / 900));
  });

  it("renders a video file at its native ratio instead of a fixed document frame", () => {
    const { container } = render(
      <WorkspaceAssetCard
        item={{
          id: "video-preview",
          title: "launch.mp4",
          name: "launch.mp4",
          path: "assets/launch.mp4",
          type: "video",
          previewUrl: "data:video/mp4;base64,AAAA",
        }}
        view="grid"
        onOpen={vi.fn()}
      />,
    );

    const preview = container.querySelector(".workspace-file-preview.video.has-visual");
    const video = preview?.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(container.querySelector(".workspace-file-copy strong")).toHaveTextContent("launch.mp4");
    expect(container.querySelector(".workspace-file-copy small")).not.toBeInTheDocument();

    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1920 },
      videoHeight: { configurable: true, value: 1080 },
    });
    fireEvent.loadedMetadata(video);
    expect(preview.style.getPropertyValue("--video-aspect-ratio")).toBe(String(1920 / 1080));
  });

  it("shows real image, video, and uniformly sized document previews inside a folder pocket", () => {
    const onRequestPreview = vi.fn();
    const { container } = render(
      <FolderCard
        folder={{
          id: "folder-mixed",
          name: "Mixed previews",
          path: "assets/mixed",
          itemCount: 3,
          children: [
            {
              id: "asset-image",
              name: "launch.png",
              path: "assets/mixed/launch.png",
              type: "image",
              previewUrl: previewPixel,
            },
            {
              id: "asset-video",
              name: "launch.mp4",
              path: "assets/mixed/launch.mp4",
              type: "video",
              previewUrl: "data:video/mp4;base64,AAAA",
            },
            {
              id: "doc-brief",
              name: "Brief.md",
              path: "assets/mixed/Brief.md",
              type: "document",
            },
          ],
        }}
        documentSources={{ "doc-brief": "# Launch brief\n\nA complete document preview." }}
        documentPreviews={{}}
        onRequestPreview={onRequestPreview}
        onOpen={vi.fn()}
      />,
    );

    expect(container.querySelector(".folder-peek.is-image img")).toBeInTheDocument();
    expect(container.querySelector(".folder-peek.is-video video")).toBeInTheDocument();
    const documentPreview = container.querySelector(".folder-peek.is-document");
    expect(documentPreview).toBeInTheDocument();
    expect(documentPreview).toHaveTextContent("Launch brief");
    expect(documentPreview).toHaveTextContent("A complete document preview.");
    expect(onRequestPreview).toHaveBeenCalledWith(expect.objectContaining({
      id: "doc-brief",
      path: "assets/mixed/Brief.md",
      type: "document",
    }));
  });

  it("shows at most four resources inside a folder pocket", () => {
    const children = Array.from({ length: 6 }, (_, index) => ({
      id: `asset-${index}`,
      name: `asset-${index}.png`,
      path: `assets/asset-${index}.png`,
      type: "image",
      previewUrl: previewPixel,
    }));
    const { container } = render(
      <FolderCard
        folder={{
          id: "folder-four-previews",
          name: "Four previews",
          path: "assets",
          itemCount: children.length,
          children,
        }}
        documentSources={{}}
        documentPreviews={{}}
        onRequestPreview={vi.fn()}
        onOpen={vi.fn()}
      />,
    );

    expect(container.querySelectorAll(".folder-peek")).toHaveLength(4);
  });

  it("renders nested folders as compact preview cards", () => {
    const { container } = render(
      <FolderCard
        folder={{
          id: "folder-parent",
          name: "Parent",
          path: "parent",
          itemCount: 2,
          previewChildren: [
            {
              id: "folder-child-one",
              name: "Child one",
              path: "parent/child-one",
              type: "folder",
              loaded: false,
            },
            {
              id: "folder-child-two",
              name: "Child two",
              path: "parent/child-two",
              type: "folder",
              loaded: false,
            },
          ],
        }}
        documentSources={{}}
        documentPreviews={{}}
        onRequestPreview={vi.fn()}
        onOpen={vi.fn()}
      />,
    );

    const nestedFolders = container.querySelectorAll(".folder-peek.is-folder");
    expect(nestedFolders).toHaveLength(2);
    expect(nestedFolders[0].querySelector(".folder-peek-folder-name")).toHaveTextContent("Child one");
    expect(nestedFolders[0].querySelector(".folder-peek-folder-name")).toHaveAttribute("title", "Child one");
    expect(nestedFolders[0].style.getPropertyValue("--peek-offset")).toBe("0%");
    expect(nestedFolders[0].style.getPropertyValue("--peek-rest-x")).toBe("-15px");
    expect(nestedFolders[0].style.getPropertyValue("--peek-reveal-x")).toBe("-30px");
    expect(nestedFolders[0].style.getPropertyValue("--peek-reveal-y")).toBe("-35px");
    expect(nestedFolders[0].style.getPropertyValue("--peek-reveal-rotate")).toBe("-1.6deg");
    expect(nestedFolders[1].style.getPropertyValue("--peek-offset")).toBe("0%");
    expect(nestedFolders[1].style.getPropertyValue("--peek-rest-x")).toBe("15px");
    expect(nestedFolders[1].style.getPropertyValue("--peek-reveal-x")).toBe("30px");
    expect(nestedFolders[1].style.getPropertyValue("--peek-reveal-y")).toBe("-35px");
    expect(nestedFolders[1].style.getPropertyValue("--peek-reveal-rotate")).toBe("1.6deg");
    expect(container.querySelector(".folder-peek-folder-shell .folder-pocket-back")).toBeInTheDocument();
    expect(container.querySelector(".folder-peek-folder-icon")).toBeInTheDocument();
    expect(container.querySelector(".folder-peek.is-folder .folder-pocket-front")).not.toBeInTheDocument();
    expect(container.querySelector(".folder-peek.is-generic")).not.toBeInTheDocument();
  });
});
