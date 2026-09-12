import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RedirectLinkDocument = RedirectLink & Document;

enum type{
    RESULT,ANSWERKEY,ADMISSION,ADMITCARD,ONLINEFORM,UPDATE,SYLLABUS,UPCOMING,VERIFICATION,SARKARIYOJANA,JOB
}

@Schema({ timestamps: true })
export class RedirectLink {
  @Prop({ required: true, enum: type })
  type: string;

  @Prop()
  targetId?: string; // MongoDB ObjectId of the post

  @Prop()
  slug?: string; // Slug of the post
  
  @Prop()
  title?:string

  @Prop()
  externalUrl?: string; // If redirecting to an external link

  @Prop()
  tag?: string; // E.g., 'upcoming', 'declared', etc.

  @Prop({ required: true, enum: ['internal', 'external'] })
  redirectType: string;

  @Prop({ default: false })
  isActive: boolean;
}

export const RedirectLinkSchema = SchemaFactory.createForClass(RedirectLink); 