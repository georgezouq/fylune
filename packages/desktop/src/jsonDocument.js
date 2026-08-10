export function validateJsonDocument(source, jsonLines = false) {
  try {
    if (jsonLines) {
      source.split(/\r?\n/).forEach((line, index) => {
        if (line.trim()) {
          try { JSON.parse(line); } catch (error) {
            error.message = `Line ${index + 1}: ${error.message}`;
            throw error;
          }
        }
      });
    } else {
      JSON.parse(source);
    }
    return null;
  } catch (error) {
    return error?.message || "Invalid JSON";
  }
}

export function formatJsonDocument(source, jsonLines = false) {
  return jsonLines
    ? source.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.stringify(JSON.parse(line))).join("\n") + "\n"
    : `${JSON.stringify(JSON.parse(source), null, 2)}\n`;
}
