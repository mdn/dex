export function resolveFundamental(path: string): {
  url?: string;
  status?: 301 | 302;
  permanent?: boolean;
  prependLocale?: boolean;
};
