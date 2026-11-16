import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ScrapedSourceDocument = ScrapedSource & Document;

export enum ScrapedSourceStatus {
  DISCOVERED = 'discovered',
  PROCESSING = 'processing',
  IN_REVIEW = 'in_review',
  PUBLISHED = 'published',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Schema({ timestamps: true })
export class ScrapedSource {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true, index: true })
  adapterKey: string; // e.g. 'sarkariresult', 'ssc', 'upsc'

  @Prop({ required: true })
  title: string;

  /** SHA-256 of the fetched page text / PDF bytes (NOT the AI output, which varies run to run). */
  @Prop()
  sourceHash?: string;

  /** Legacy field from the first crawler version; kept so old documents still load. */
  @Prop()
  contentHash?: string;

  @Prop({ enum: ScrapedSourceStatus, default: ScrapedSourceStatus.DISCOVERED, index: true })
  status: ScrapedSourceStatus;

  @Prop({ type: Types.ObjectId, ref: 'Job', index: true })
  jobId?: Types.ObjectId;

  @Prop()
  suggestedType?: string; // 'job' | 'admit-card' | 'result' | 'admission' | 'answer-key' | 'syllabus'

  @Prop({ default: 0 })
  revisionCount: number;

  /** Consecutive failures. After CRAWLER_MAX_ATTEMPTS the source is retried only after nextAttemptAt. */
  @Prop({ default: 0 })
  attempts: number;

  @Prop()
  nextAttemptAt?: Date;

  /** Result of the automatic quality gate for the latest extraction. */
  @Prop({ type: Object })
  gate?: { passed: boolean; reasons: string[]; confidence?: number; at: Date };

  @Prop({ default: false })
  autoPublished: boolean;

  @Prop({ index: true })
  autoPublishedAt?: Date;

  /** When the crawler last wrote to the post; a later human edit stops automatic updates. */
  @Prop()
  lastAutoWriteAt?: Date;

  /** Set when the source changed but the update could not be applied automatically. */
  @Prop({ type: Object })
  needsAttention?: { reason: string; at: Date };

  @Prop()
  lastCheckedAt?: Date;

  @Prop()
  errorMessage?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const ScrapedSourceSchema = SchemaFactory.createForClass(ScrapedSource);

ScrapedSourceSchema.index({ adapterKey: 1, status: 1 });
ScrapedSourceSchema.index({ url: 1 }, { unique: true });
ScrapedSourceSchema.index({ status: 1, nextAttemptAt: 1 });

