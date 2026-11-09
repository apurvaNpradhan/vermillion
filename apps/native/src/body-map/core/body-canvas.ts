/** Every layer shares one canvas, so the body keeps its shape at any width. */
export const BODY_CANVAS = { width: 303, height: 738 } as const;
export const BODY_ASPECT = BODY_CANVAS.width / BODY_CANVAS.height;
