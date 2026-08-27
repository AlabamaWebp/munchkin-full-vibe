export const UI_STATES = [
  'home',
  'lobby',
  'game',
  'combat',
  'reaction',
  'blocking-discard',
  'full-hand',
] as const;

export const UI_PROJECTS = [
  { name: 'mobile-360x640', viewport: { width: 360, height: 640 } },
  { name: 'release-390x844', viewport: { width: 390, height: 844 } },
  { name: 'mobile-430x932', viewport: { width: 430, height: 932 } },
  { name: 'tablet-768x1024', viewport: { width: 768, height: 1024 } },
  { name: 'landscape-1024x768', viewport: { width: 1024, height: 768 } },
] as const;
