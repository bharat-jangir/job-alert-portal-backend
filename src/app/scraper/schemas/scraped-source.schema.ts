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
  @Prop({ required: true, unique: true, index: true })
  url: string;

  @Prop({ required: true, index: true })
  adapterKey: string; // e.g. 'sarkariresult', 'ssc', 'upsc'

  @Prop({ required: true })
  title: string;

  @Prop()
  contentHash?: string; // SHA-256 hash of raw text or binary payload to detect updates

  @Prop({ enum: ScrapedSourceStatus, default: ScrapedSourceStatus.DISCOVERED, index: true })
  status: ScrapedSourceStatus;

  @Prop({ type: Types.ObjectId, ref: 'Job', index: true })
  jobId?: Types.ObjectId;

  @Prop()
  suggestedType?: string; // 'job' | 'admit-card' | 'result' | 'admission' | 'answer-key' | 'syllabus'

  @Prop({ default: 0 })
  revisionCount: number;

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

