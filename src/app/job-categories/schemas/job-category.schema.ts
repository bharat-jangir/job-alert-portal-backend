import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type JobCategoryDocument = JobCategory & Document;

@Schema({ timestamps: true })
export class JobCategory {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop()
  displayName?: string;

  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop({ required: true, default: 0 })
  sequenceNo: number;

  @Prop({ default: true })
  showOnHome: boolean;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const JobCategorySchema = SchemaFactory.createForClass(JobCategory);
