export interface IndexedDoc {
  id: number;
  mdn_url: string;
  title: string;
  token_count: number | null;
  has_embedding: boolean;
  has_embedding_next: boolean;
  markdown_hash: string;
  text_hash: string;
}

export interface Doc {
  mdn_url: string;
  title: string;
  title_short: string;
  markdown: string;
  markdown_hash: string;
  text?: string;
  text_hash?: string;
}

export type FormattingUpdate = Pick<
  Doc,
  "mdn_url" | "title" | "title_short" | "markdown" | "markdown_hash"
>;

export type EmbeddingUpdate = Pick<Doc, "mdn_url" | "text"> & {
  has_embedding: boolean;
  has_embedding_next: boolean;
};

export interface JSONDoc {
  mdn_url: string;
  body: Section[];
}

export interface JSONDocMetadata {
  title: string;
  short_title: string;
  mdn_url: string;
  hash?: string;
}

export type Section = ProseSection | SpecificationsSection | BCDSection;

export interface ProseSection {
  type: "prose";
  value: {
    id: string | null;
    title: string | null;
    isH3: boolean;
    content?: string;
  };
}

export interface Specification {
  bcdSpecificationURL: string;
  title: string;
}

export interface SpecificationsSection {
  type: "specifications";
  value: {
    id: string;
    title: string;
    isH3: boolean;
    query: string;
    specifications: Specification[];
  };
}

export interface BCDSection {
  type: "browser_compatibility";
  value: {
    id: string;
    title: string;
    isH3: boolean;
    query: string;
  };
}
