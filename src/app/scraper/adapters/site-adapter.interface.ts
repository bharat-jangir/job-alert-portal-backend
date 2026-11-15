export interface DiscoveredCandidate {
  url: string;
  title: string;
  suggestedType?: string;
  publishedOrUpdatedDate?: string;
  metadata?: Record<string, any>;
}

export interface ISiteAdapter {
  /** Unique key identifying the adapter (e.g. 'sarkariresult', 'ssc', 'upsc') */
  readonly adapterKey: string;

  /** Human-friendly name (e.g. 'SarkariResult.com', 'Staff Selection Commission') */
  readonly name: string;

  /** Discover newly announced links and posts from the target source */
  discoverCandidates(limit?: number): Promise<DiscoveredCandidate[]>;
}

