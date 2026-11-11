// Liga e desliga as animações do app (preferência sua + "reduzir movimento" do iPhone).
import { useSyncExternalStore } from "react";

let ligado = true;
const ouvintes = new Set<() => void>();

export const animOn = () => ligado;
export function setAnimOn(b: boolean) {
  if (b === ligado) return;
  ligado = b;
  ouvintes.forEach((f) => f());
}
export const useAnim = () => useSyncExternalStore((cb) => (ouvintes.add(cb), () => ouvintes.delete(cb)), () => ligado, () => true);
