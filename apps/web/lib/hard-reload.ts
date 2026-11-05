/** A full page load of the current URL (its own module, so tests can stub it). */
export function hardReload(): void {
  window.location.reload();
}
