export const nativeLocales = ["en", "zh-CN", "zh-TW", "es", "fr", "it", "de", "ja", "ko", "ar"];

const messages = {
  en: {
    documentFolderAccessTitle: "Allow access to the document folder",
    documentFolderAccessMessage: "Opening one file does not grant access to its images. Select this document’s folder to load relative images and attachments. Cancel keeps your current document open.",
    documentFolderAccessButton: "Allow folder access",
    documentFolderAccessInvalid: "Select the document’s own folder to grant access. The document was not opened; try opening it again.",
    openProjectTitle: "Open a project folder",
    openProjectButton: "Open project",
    createProjectTitle: "Create a workspace folder",
    createProjectButton: "Create workspace",
    addFileTitle: "Add a file",
    addFileButton: "Add to document",
    assetFilter: "Images, video, PDF, and Office documents",
    unsupportedPreview: "This preview is not available.",
  },
  "zh-CN": {
    documentFolderAccessTitle: "允许访问文档所在文件夹",
    documentFolderAccessMessage: "打开单个文件不会同时获得图片权限。请选择此文档所在的文件夹，以加载相对路径图片和附件。取消后保留当前文档。",
    documentFolderAccessButton: "允许访问文件夹",
    documentFolderAccessInvalid: "请选择文档自身所在的文件夹并授予权限。本次未打开文档，请重新打开后选择。",
    openProjectTitle: "打开项目文件夹",
    openProjectButton: "打开项目",
    createProjectTitle: "创建工作空间文件夹",
    createProjectButton: "创建工作空间",
    addFileTitle: "添加文件",
    addFileButton: "添加到文档",
    assetFilter: "图片、视频、PDF 和 Office 文档",
    unsupportedPreview: "此预览不可用。",
  },
  "zh-TW": {
    documentFolderAccessTitle: "允許存取文件所在資料夾",
    documentFolderAccessMessage: "開啟單一檔案不會同時取得圖片權限。請選擇此文件所在的資料夾，以載入相對路徑圖片和附件。取消後保留目前文件。",
    documentFolderAccessButton: "允許存取資料夾",
    documentFolderAccessInvalid: "請選擇文件本身所在的資料夾並授予權限。本次未開啟文件，請重新開啟後選擇。",
    openProjectTitle: "開啟專案資料夾",
    openProjectButton: "開啟專案",
    createProjectTitle: "建立工作空間資料夾",
    createProjectButton: "建立工作空間",
    addFileTitle: "加入檔案",
    addFileButton: "加入文件",
    assetFilter: "圖片、影片、PDF 和 Office 文件",
    unsupportedPreview: "此預覽無法使用。",
  },
  es: {
    openProjectTitle: "Abrir una carpeta de proyecto",
    openProjectButton: "Abrir proyecto",
    createProjectTitle: "Crear una carpeta de espacio de trabajo",
    createProjectButton: "Crear espacio de trabajo",
    addFileTitle: "Añadir un archivo",
    addFileButton: "Añadir al documento",
    assetFilter: "Imágenes, vídeo, PDF y documentos de Office",
    unsupportedPreview: "Esta vista previa no está disponible.",
  },
  fr: {
    openProjectTitle: "Ouvrir un dossier de projet",
    openProjectButton: "Ouvrir le projet",
    createProjectTitle: "Créer un dossier d’espace de travail",
    createProjectButton: "Créer l’espace de travail",
    addFileTitle: "Ajouter un fichier",
    addFileButton: "Ajouter au document",
    assetFilter: "Images, vidéos, PDF et documents Office",
    unsupportedPreview: "Cet aperçu n’est pas disponible.",
  },
  it: {
    openProjectTitle: "Apri una cartella di progetto",
    openProjectButton: "Apri progetto",
    createProjectTitle: "Crea una cartella per l’area di lavoro",
    createProjectButton: "Crea area di lavoro",
    addFileTitle: "Aggiungi un file",
    addFileButton: "Aggiungi al documento",
    assetFilter: "Immagini, video, PDF e documenti Office",
    unsupportedPreview: "Questa anteprima non è disponibile.",
  },
  de: {
    openProjectTitle: "Projektordner öffnen",
    openProjectButton: "Projekt öffnen",
    createProjectTitle: "Arbeitsbereichsordner erstellen",
    createProjectButton: "Arbeitsbereich erstellen",
    addFileTitle: "Datei hinzufügen",
    addFileButton: "Zum Dokument hinzufügen",
    assetFilter: "Bilder, Video, PDF und Office-Dokumente",
    unsupportedPreview: "Diese Vorschau ist nicht verfügbar.",
  },
  ja: {
    openProjectTitle: "プロジェクトフォルダを開く",
    openProjectButton: "プロジェクトを開く",
    createProjectTitle: "ワークスペースフォルダを作成",
    createProjectButton: "ワークスペースを作成",
    addFileTitle: "ファイルを追加",
    addFileButton: "文書に追加",
    assetFilter: "画像、動画、PDF、Office 文書",
    unsupportedPreview: "このプレビューは利用できません。",
  },
  ko: {
    openProjectTitle: "프로젝트 폴더 열기",
    openProjectButton: "프로젝트 열기",
    createProjectTitle: "작업 공간 폴더 만들기",
    createProjectButton: "작업 공간 만들기",
    addFileTitle: "파일 추가",
    addFileButton: "문서에 추가",
    assetFilter: "이미지, 동영상, PDF 및 Office 문서",
    unsupportedPreview: "이 미리보기는 사용할 수 없습니다.",
  },
  ar: {
    openProjectTitle: "فتح مجلد مشروع",
    openProjectButton: "فتح المشروع",
    createProjectTitle: "إنشاء مجلد لمساحة العمل",
    createProjectButton: "إنشاء مساحة العمل",
    addFileTitle: "إضافة ملف",
    addFileButton: "إضافة إلى المستند",
    assetFilter: "الصور والفيديو وPDF ومستندات Office",
    unsupportedPreview: "هذه المعاينة غير متاحة.",
  },
};

export function normalizeNativeLocale(value) {
  const locale = String(value || "").replace("_", "-");
  if (/^zh-(TW|HK|MO|Hant)/i.test(locale)) return "zh-TW";
  if (/^zh/i.test(locale)) return "zh-CN";
  const exact = nativeLocales.find((item) => item.toLowerCase() === locale.toLowerCase());
  if (exact) return exact;
  return nativeLocales.find((item) => locale.toLowerCase().startsWith(`${item.toLowerCase()}-`)) || "en";
}

export function nativeMessage(locale, key) {
  const normalized = normalizeNativeLocale(locale);
  return messages[normalized]?.[key] || messages.en[key] || key;
}
