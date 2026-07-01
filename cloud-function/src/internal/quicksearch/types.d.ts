export interface SearchIndexEntry {
  url: string;
  title: string;
}

export interface SearchIndexItem extends SearchIndexEntry {
  label: string;
}

export interface SearchIndexFlexItem {
  index: number;
  title: string;
  slugTail: string;
}

export interface SearchIndex {
  flex: SearchIndexFlexItem[];
  items: SearchIndexItem[];
  byLabel: Map<string, SearchIndexItem | null>;
}
