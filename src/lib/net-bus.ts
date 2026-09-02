let send: ((act: unknown) => void) | null = null;

export function bindNetSend(fn: ((act: unknown) => void) | null) {
  send = fn;
}

export function netSend(act: unknown) {
  send?.(act);
}
