import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BasePost } from '../../common/schema/base-post.schema';
import * as mongoose from 'mongoose';

export type JobDocument = Job & Document;

export enum ExperienceLevel {
  ENTRY = 'ENTRY',
  MID = 'MID',
  SENIOR = 'SENIOR',
  EXECUTIVE = 'EXECUTIVE'
}

export enum QualificationLevel {
  HIGH_SCHOOL = 'HIGH_SCHOOL',
  BACHELORS = 'BACHELORS',
  MASTERS = 'MASTERS',
  PHD = 'PHD',
  OTHER = 'OTHER'
}

// Dynamic job categories are now managed via JobCategory collection
export interface ImportantDate {
  label?: string;
  date?: Date;
}

// The main Job schema class, representing a job post in the database
@Schema({ timestamps: true })
export class Job extends BasePost {
  @Prop({ default: false })
  isBulletin?: boolean;

  @Prop({ index: true })
  organization?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Organization' })
  organizationId?: mongoose.Types.ObjectId;

  @Prop({ index: true })
  location?: string;

  @Prop()
  salary?: string;

  @Prop({ enum: QualificationLevel, type: String })
  qualification?: QualificationLevel;

  @Prop({ enum: ExperienceLevel, type: String })
  experience?: ExperienceLevel;

  @Prop()
  lastDate?: Date;

  @Prop()
  applyLink?: string;

  @Prop()
  description?: string;

  @Prop({ default: true, index: true })
  isActive?: boolean;

  @Prop({ default: 0, min: 0 })
  views?: number;

  @Prop({ default: 0, min: 0 })
  applications?: number;

  @Prop({
    type: [{
      label: { type: String },
      date: { type: Date }
    }],
    default: []
  })
  importantDates?: ImportantDate[];

  @Prop()
  eligibility?: string;

  @Prop()
  totalVacancy?: string;

  @Prop()
  ageLimit?: string;

  // Store the actual text/slug of the category for easy querying without joining
  @Prop()
  type?: string;

  // The relationship ID to the JobCategory
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'JobCategory' })
  categoryId?: mongoose.Types.ObjectId;
}

export const JobSchema = SchemaFactory.createForClass(Job);

// Define compound indexes
JobSchema.index({ organization: 1, title: 1 });
JobSchema.index({ 'importantDates.date': 1 });
// Add index for slug field
JobSchema.index({ slug: 1 }, { unique: true }); 