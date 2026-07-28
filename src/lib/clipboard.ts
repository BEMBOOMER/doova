/**
 * Copying text to the clipboard, with the old way as a backstop.
 *
 * navigator.clipboard needs a secure context and a permissions check, and a
 * webview served over a custom scheme is not guaranteed to qualify. The
 * deprecated execCommand path has neither requirement, so it covers the case
 * where the modern API simply is not there.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through: not available, or refused outside a user gesture
  }

  try {
    const field = document.createElement("textarea");
    field.value = text;
    // off-screen rather than hidden: a display:none field cannot be selected
    field.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(field);
    return ok;
  } catch (err) {
    console.error("clipboard copy failed", err);
    return false;
  }
}
