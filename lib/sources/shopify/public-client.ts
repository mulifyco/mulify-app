/**
 * Public Shopify storefront JSON endpoints — no Admin API, no auth.
 * Some shops disable these endpoints; 404 is treated as "no public JSON".
 */

import { HttpError } from "@/lib/http";
import { logger } from "@/lib/logger";
import type { ShopifyCollectionProductsFanoutV1 } from "@/lib/sources/shared/types";
import type {
  ShopifyCollectionRawPayload,
  ShopifyImageRaw,
  ShopifyProductRawPayload,
  ShopifyVariantRaw,
} from "@/types";
import { MOCK_SHOPIFY_COLLECTIONS, MOCK_SHOPIFY_PRODUCTS } from "./mock-data";

interface CartJsShape {
  currency?: string;
  /** Present on some themes / API versions */
  shop?: string;
  permanent_domain?: string;
}

interface ProductsJsonResponse {
  products?: unknown;
}

interface CollectionsJsonResponse {
  collections?: unknown;
}

async function fetchJsonPublic<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mulify-Library/1.0",
      },
      signal: controller.signal,
    });

    if (response.status === 404) {
      throw new HttpError(404, "Not Found", url, "");
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new HttpError(response.status, response.statusText, url, body);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

export type ShopifyPublicFetchOptions = { mock?: boolean };

function extractProductsArray(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.products)) return o.products;
  const nested = o.products;
  if (nested && typeof nested === "object") {
    const edges = (nested as { edges?: unknown }).edges;
    if (Array.isArray(edges)) {
      return edges
        .map((e) => {
          if (e && typeof e === "object" && "node" in (e as object)) {
            return (e as { node: unknown }).node;
          }
          return e;
        })
        .filter(Boolean);
    }
    const nodes = (nested as { nodes?: unknown }).nodes;
    if (Array.isArray(nodes)) return nodes.filter(Boolean);
  }
  if (o.product && typeof o.product === "object") return [o.product];
  return [];
}

function coerceNumberId(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function coerceString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function parseVariantNode(v: unknown, index: number): ShopifyVariantRaw | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const id = coerceNumberId(r.id) ?? 1_000_001 + index;
  const title = coerceString(r.title) ?? "Default";
  const priceRaw = r.price;
  const price =
    typeof priceRaw === "number"
      ? priceRaw.toFixed(2)
      : coerceString(priceRaw) ?? "0";
  return {
    id,
    title,
    price,
    compare_at_price: coerceString(r.compare_at_price),
    available: typeof r.available === "boolean" ? r.available : undefined,
    inventory_quantity:
      typeof r.inventory_quantity === "number" ? r.inventory_quantity : undefined,
    sku: coerceString(r.sku),
  };
}

function parseImageNode(img: unknown): ShopifyImageRaw | null {
  if (!img || typeof img !== "object") return null;
  const r = img as Record<string, unknown>;
  const id = coerceNumberId(r.id) ?? 0;
  const src = coerceString(r.src);
  if (!src) return null;
  return {
    id,
    src,
    position: typeof r.position === "number" ? r.position : 0,
    alt: coerceString(r.alt),
  };
}

export function parseShopifyProductNode(raw: unknown, ctx: { domain: string; index: number }): {
  product: ShopifyProductRawPayload | null;
  error?: string;
} {
  try {
    if (!raw || typeof raw !== "object") {
      return { product: null, error: `index ${ctx.index}: not an object` };
    }
    const r = raw as Record<string, unknown>;
    const handle = coerceString(r.handle)?.trim();
    if (!handle) {
      return { product: null, error: `index ${ctx.index}: missing handle` };
    }
    const id = coerceNumberId(r.id) ?? -1 - ctx.index;
    const title = coerceString(r.title)?.trim() || handle;

    let variants: ShopifyVariantRaw[] | undefined;
    if (Array.isArray(r.variants)) {
      variants = r.variants
        .map((node, idx) => parseVariantNode(node, idx))
        .filter((x): x is ShopifyVariantRaw => Boolean(x));
    }
    if (!variants?.length) {
      variants = [{ id: Math.abs(id) + 1, title: "Default", price: "0" }];
    }

    let images: ShopifyImageRaw[] | undefined;
    if (Array.isArray(r.images)) {
      images = r.images.map(parseImageNode).filter((x): x is ShopifyImageRaw => Boolean(x));
    }

    const product: ShopifyProductRawPayload = {
      id,
      title,
      handle,
      body_html: coerceString(r.body_html),
      vendor: coerceString(r.vendor),
      product_type: coerceString(r.product_type),
      created_at: coerceString(r.created_at),
      updated_at: coerceString(r.updated_at),
      published_at: coerceString(r.published_at),
      tags: coerceString(r.tags),
      variants,
      images,
      options: Array.isArray(r.options) ? (r.options as ShopifyProductRawPayload["options"]) : undefined,
    };
    return { product };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { product: null, error: `index ${ctx.index}: ${msg}` };
  }
}

function extractCollectionsArray(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.collections)) return o.collections;
  const nested = o.collections;
  if (nested && typeof nested === "object") {
    const edges = (nested as { edges?: unknown }).edges;
    if (Array.isArray(edges)) {
      return edges
        .map((e) => (e && typeof e === "object" && "node" in e ? (e as { node: unknown }).node : e))
        .filter(Boolean);
    }
  }
  return [];
}

export async function fetchShopifyCartMeta(
  domain: string,
  options?: ShopifyPublicFetchOptions
): Promise<{ currency?: string; shop?: string; permanent_domain?: string } | null> {
  if (options?.mock) {
    return { currency: "USD" };
  }
  const url = `https://${domain}/cart.js`;
  try {
    const data = await fetchJsonPublic<CartJsShape>(url, 10_000);
    return {
      currency: data.currency,
      shop: typeof data.shop === "string" ? data.shop : undefined,
      permanent_domain: typeof data.permanent_domain === "string" ? data.permanent_domain : undefined,
    };
  } catch (err) {
    if (err instanceof HttpError && err.isNotFound) {
      return null;
    }
    throw err;
  }
}

async function fetchPrimaryProductsPage(
  domain: string,
  page: number,
  limit: number,
  options?: ShopifyPublicFetchOptions
): Promise<ShopifyProductRawPayload[]> {
  if (options?.mock) {
    if (page !== 1) return [];
    return MOCK_SHOPIFY_PRODUCTS.slice(0, Math.min(limit, MOCK_SHOPIFY_PRODUCTS.length));
  }
  const url = `https://${domain}/products.json?limit=${limit}&page=${page}`;
  const data = await fetchJsonPublic<ProductsJsonResponse>(url, 20_000);
  const arr = extractProductsArray(data);
  let parseFailures = 0;
  const out: ShopifyProductRawPayload[] = [];
  arr.forEach((node, index) => {
    const { product, error } = parseShopifyProductNode(node, { domain, index });
    if (product) out.push(product);
    else if (error) {
      parseFailures++;
      logger.warn("shopify.public.products_parse_skip", { domain, page, error });
    }
  });
  if (parseFailures > 0) {
    logger.warn("shopify.public.products_primary_summary", {
      domain,
      page,
      nodes: arr.length,
      parsed: out.length,
      parseFailures,
    });
  }
  return out;
}

async function listCollectionHandles(
  domain: string,
  options?: ShopifyPublicFetchOptions
): Promise<string[]> {
  if (options?.mock) {
    return MOCK_SHOPIFY_COLLECTIONS.map((c) => c.handle);
  }
  const handles: string[] = [];
  let page = 1;
  const limit = 250;
  for (;;) {
    const url = `https://${domain}/collections.json?limit=${limit}&page=${page}`;
    try {
      const data = await fetchJsonPublic<CollectionsJsonResponse>(url, 20_000);
      const arr = extractCollectionsArray(data);
      if (!arr.length) break;
      for (const node of arr) {
        if (!node || typeof node !== "object") continue;
        const h = coerceString((node as Record<string, unknown>).handle)?.trim();
        if (h) handles.push(h);
      }
      if (arr.length < limit) break;
      page++;
      if (page > 40) break;
    } catch (e) {
      if (e instanceof HttpError && e.isNotFound) break;
      throw e;
    }
  }
  return [...new Set(handles)];
}

async function fetchCollectionProductsPageRaw(
  domain: string,
  handle: string,
  page: number,
  limit: number,
  options?: ShopifyPublicFetchOptions
): Promise<unknown[]> {
  if (options?.mock) {
    if (page !== 1) return [];
    return MOCK_SHOPIFY_PRODUCTS as unknown[];
  }
  const url = `https://${domain}/collections/${encodeURIComponent(handle)}/products.json?limit=${limit}&page=${page}`;
  try {
    const data = await fetchJsonPublic<ProductsJsonResponse>(url, 20_000);
    return extractProductsArray(data);
  } catch (e) {
    if (e instanceof HttpError && e.isNotFound) return [];
    throw e;
  }
}

export interface ResolveShopifyProductsBatchResult {
  items: ShopifyProductRawPayload[];
  nextFanout: ShopifyCollectionProductsFanoutV1 | null;
  /** Where this batch came from (logging / diagnostics). */
  source: "primary_json" | "collection_fanout";
}

/**
 * Resolves one adapter batch of products: tries /products.json first, then collection fan-out.
 */
export async function resolveShopifyProductsForSyncBatch(
  domain: string,
  args: {
    primaryPage: number;
    pageSize: number;
    mock?: boolean;
    fanout: ShopifyCollectionProductsFanoutV1 | null | undefined;
  }
): Promise<ResolveShopifyProductsBatchResult> {
  const { primaryPage, pageSize, mock, fanout } = args;

  if (!fanout) {
    const primary = await fetchPrimaryProductsPage(domain, primaryPage, pageSize, { mock });
    if (primary.length > 0) {
      logger.info("shopify.public.products_batch", {
        domain,
        source: "primary_json",
        primaryPage,
        count: primary.length,
        fanout: false,
      });
      return { items: primary, nextFanout: null, source: "primary_json" };
    }
    if (primaryPage > 1) {
      logger.info("shopify.public.products_batch", {
        domain,
        source: "primary_json",
        primaryPage,
        count: 0,
        fanout: false,
        note: "empty_primary_non_first_page",
      });
      return { items: [], nextFanout: null, source: "primary_json" };
    }
    const handles = await listCollectionHandles(domain, { mock });
    logger.info("shopify.public.collection_fanout_init", {
      domain,
      collectionHandles: handles.length,
    });
    if (!handles.length) {
      return { items: [], nextFanout: null, source: "collection_fanout" };
    }
    return resolveShopifyProductsForSyncBatch(domain, {
      primaryPage,
      pageSize,
      mock,
      fanout: { handles, handleIdx: 0, page: 1 },
    });
  }

  const seen = new Set<string>();
  const out: ShopifyProductRawPayload[] = [];
  let handleIdx = fanout.handleIdx;
  let colPage = fanout.page;
  let startOffset = fanout.startOffset ?? 0;
  let parseFailures = 0;
  let nodesSeen = 0;

  while (out.length < pageSize && handleIdx < fanout.handles.length) {
    const handle = fanout.handles[handleIdx];
    const rawNodes = await fetchCollectionProductsPageRaw(domain, handle, colPage, 250, { mock });
    nodesSeen += rawNodes.length;
    if (!rawNodes.length) {
      handleIdx++;
      colPage = 1;
      startOffset = 0;
      continue;
    }
    let i = startOffset;
    for (; i < rawNodes.length && out.length < pageSize; i++) {
      const node = rawNodes[i];
      const { product, error } = parseShopifyProductNode(node, { domain, index: i });
      if (product && !seen.has(product.handle)) {
        seen.add(product.handle);
        out.push(product);
      } else if (product && seen.has(product.handle)) {
        /* duplicate handle on same page — skip */
      } else if (error) {
        parseFailures++;
        logger.warn("shopify.public.collection_products_parse_skip", { domain, collection: handle, error });
      }
    }
    const stoppedEarly = out.length >= pageSize && i < rawNodes.length;
    if (stoppedEarly) {
      const nextFanout: ShopifyCollectionProductsFanoutV1 = {
        handles: fanout.handles,
        handleIdx,
        page: colPage,
        startOffset: i,
      };
      logger.info("shopify.public.products_batch", {
        domain,
        source: "collection_fanout",
        count: out.length,
        nodesSeen,
        parseFailures,
        fanout: true,
        fanoutPosition: { handleIdx, page: colPage, startOffset: i },
      });
      return { items: out, nextFanout, source: "collection_fanout" };
    }
    startOffset = 0;
    if (rawNodes.length < 250) {
      handleIdx++;
      colPage = 1;
    } else {
      colPage++;
    }
  }

  const exhausted = handleIdx >= fanout.handles.length;
  const nextFanout: ShopifyCollectionProductsFanoutV1 | null = exhausted
    ? null
    : { handles: fanout.handles, handleIdx, page: colPage, startOffset: 0 };

  logger.info("shopify.public.products_batch", {
    domain,
    source: "collection_fanout",
    count: out.length,
    nodesSeen,
    parseFailures,
    fanout: Boolean(nextFanout),
    fanoutPosition: nextFanout ? { handleIdx, page: colPage } : null,
  });

  return { items: out, nextFanout, source: "collection_fanout" };
}

/** @deprecated Use resolveShopifyProductsForSyncBatch for sync — kept for direct callers/tests. */
export async function fetchShopifyProductsPage(
  domain: string,
  page: number,
  limit: number,
  options?: ShopifyPublicFetchOptions
): Promise<ShopifyProductRawPayload[]> {
  const r = await resolveShopifyProductsForSyncBatch(domain, {
    primaryPage: page,
    pageSize: limit,
    mock: options?.mock,
    fanout: null,
  });
  return r.items;
}

export async function fetchShopifyCollectionsPage(
  domain: string,
  page: number,
  limit: number,
  options?: ShopifyPublicFetchOptions
): Promise<ShopifyCollectionRawPayload[]> {
  if (options?.mock) {
    if (page !== 1) return [];
    return MOCK_SHOPIFY_COLLECTIONS.slice(0, Math.min(limit, MOCK_SHOPIFY_COLLECTIONS.length));
  }
  const url = `https://${domain}/collections.json?limit=${limit}&page=${page}`;
  try {
    const data = await fetchJsonPublic<CollectionsJsonResponse>(url, 20_000);
    const arr = extractCollectionsArray(data);
    const out: ShopifyCollectionRawPayload[] = [];
    let failures = 0;
    arr.forEach((node, index) => {
      if (!node || typeof node !== "object") {
        failures++;
        return;
      }
      const r = node as Record<string, unknown>;
      const handle = coerceString(r.handle)?.trim();
      if (!handle) {
        failures++;
        logger.warn("shopify.public.collection_parse_skip", { domain, page, index });
        return;
      }
      const id = coerceNumberId(r.id) ?? -1 - index;
      out.push({
        id,
        handle,
        title: coerceString(r.title)?.trim() || handle,
        description: coerceString(r.description),
        image: r.image && typeof r.image === "object" ? parseImageNode(r.image) ?? undefined : undefined,
        products_count: typeof r.products_count === "number" ? r.products_count : undefined,
      });
    });
    if (failures > 0) {
      logger.warn("shopify.public.collections_summary", { domain, page, failures, parsed: out.length });
    }
    return out;
  } catch (err) {
    if (err instanceof HttpError && err.isNotFound) {
      return [];
    }
    throw err;
  }
}
