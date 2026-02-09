import type { Doc as RariDoc } from "@mdn/rari";

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

export type DocMetadata = Pick<RariDoc, "title" | "short_title" | "mdn_url"> & {
  hash: string;
};
