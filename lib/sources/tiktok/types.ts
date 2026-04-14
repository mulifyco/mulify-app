/**
 * Raw payloads stored on RawRecord before normalization (TikTok page sync).
 */

export type TikTokPageRawVideoPayload = {
  platform: "TIKTOK";
  videoId: string;
  handle: string | null;
  profileUrl: string | null;
  creativeUrl: string;
  thumbnailUrl?: string | null;
  caption?: string | null;
  outboundUrl?: string | null;
  bioLinks: string[];
  hookPhrase?: string | null;
  hashtags?: string[];
  musicId?: string | null;
  musicTitle?: string | null;
  fetchedAt: string;
};

export type TikTokPageRawLandingPayload = {
  kind: "tiktok_outbound";
  url: string;
  fetchedAt: string;
};
