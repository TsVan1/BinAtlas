/**
 * 复制到剪贴板。优先 Clipboard API（需要 https / localhost），
 * 失败时退化到 `execCommand('copy')`：本地 dev 与 file:// 场景都可能是非安全上下文。
 *
 * 返回值决定 UI 显示「已复制」还是「复制失败」，不假装成功。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 权限被拒 / 非安全上下文：继续走兜底
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
