import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BasePost } from '../../common/schema/base-post.schema';

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

// Enum for different job types, used for categorizing posts
export enum JobType {
  JOB='job',
  RESULT = 'result',           // For result posts
  ANSWERKEY = 'answer-key',    // For answer key posts
  ADMISSION = 'admission',     // For admission posts
  ADMITCARD = 'admit-card',    // For admit card posts
  ONLINEFORM = 'online-form',  // For online form posts
  UPDATE = 'update',           // For update posts
  SYLLABUS = 'syllabus',       // For syllabus posts
  UPCOMING = 'upcoming',       // For upcoming posts
  VERIFICATION = 'verification', // For verification posts
  SARKARIYOJANA = 'sarkari-yojana', // For sarkari yojana posts
}

export interface ImportantDate {
  label?: string;
  date?: Date;
}

// The main Job schema class, representing a job post in the database
@Schema({ timestamps: true })
export class Job extends BasePost {
  @Prop({ index: true })
  organization?: string;

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

  // Type of the job post, used for filtering and categorization
  @Prop({ enum: JobType })
  type?: JobType;
}

export const JobSchema = SchemaFactory.createForClass(Job);

// Define compound indexes
JobSchema.index({ organization: 1, title: 1 });
JobSchema.index({ 'importantDates.date': 1 });
// Add index for slug field
JobSchema.index({ slug: 1 }, { unique: true }); 