import { Coder } from "./coding.js";
import { Payload } from "./types.js";

export function createPong2GetHandler(
  zoneKeys: object,
  coder: Coder,
  env: { SIGN_SECRET: string }
): (
  body: string,
  countryCode: string,
  userAgent: string
) => Promise<{
  statusCode: number;
  payload: { [index: string]: Payload | boolean };
}>;

export function createPong2ClickHandler(coder: Coder): (
  params: URLSearchParams,
  countryCode: string,
  userAgent: string
) => Promise<{
  status: number;
  location: string;
}>;

export function createPong2ViewedHandler(
  coder: Coder
): (
  params: URLSearchParams,
  countryCode: string,
  userAgent: string
) => Promise<void>;
