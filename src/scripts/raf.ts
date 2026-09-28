/* ============================================================
   Une seule boucle d'animation pour tout le site.
   Chaque module s'y abonne ; on n'ouvre jamais un second
   requestAnimationFrame concurrent (source classique de saccades).
   ============================================================ */
export type Cleanup = () => void;
type Task = (time: number) => void;

const tasks = new Set<Task>();
let id = 0;

const tick = (time: number) => {
  id = requestAnimationFrame(tick);
  tasks.forEach((t) => t(time));
};

/** Abonne une fonction à la boucle. Retourne son désabonnement. */
export function onFrame(task: Task): Cleanup {
  tasks.add(task);
  if (!id) id = requestAnimationFrame(tick);
  return () => {
    tasks.delete(task);
    if (!tasks.size && id) { cancelAnimationFrame(id); id = 0; }
  };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Progression de `a` à `b` bornée à [0,1]. */
export const range = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));

/** Adoucissement symétrique — départ et arrivée sans à-coup. */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
