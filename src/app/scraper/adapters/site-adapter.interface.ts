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

  /**
   * Domains that belong to the source site itself. Links to these are NOT official destinations,
   * so a post whose "apply" link points here is held back instead of sending visitors to the source.
   */
  readonly ownDomains: string[];

  /** Discover newly announced links and posts from the target source */
  discoverCandidates(limit?: number): Promise<DiscoveredCandidate[]>;
}

