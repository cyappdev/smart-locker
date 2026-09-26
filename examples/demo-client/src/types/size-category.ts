export const SIZE_CATEGORIES = ['small', 'medium', 'large'] as const;
export type SizeCategory = (typeof SIZE_CATEGORIES)[number];
