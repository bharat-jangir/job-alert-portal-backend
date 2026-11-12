import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type JobRevisionDocument = JobRevision & Document;

/** A restorable snapshot of a post, taken before every edit. */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class JobRevision {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Job', required: true, index: true })
  postId: Types.ObjectId;

  @Prop({ required: true })
  version: number;

  @Prop({ type: Object, required: true })
  snapshot: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  editorId?: Types.ObjectId;

  @Prop()
  editorName?: string;

  @Prop()
  note?: string;
}

export const JobRevisionSchema = SchemaFactory.createForClass(JobRevision);
JobRevisionSchema.index({ postId: 1, version: -1 });
