/** Metadata only: callback failures never change request outcomes. */
export function emit(callback, event) {
  if (callback) { try { callback(event); } catch { console.warn('Valen onEvent callback failed'); } }
}
