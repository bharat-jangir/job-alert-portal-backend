import { Prop, Schema } from '@nestjs/mongoose';

@Schema()
export class BasePost {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop()
  htmlContent?: string;

  @Prop()
  metaTitle: string;

  @Prop()
  metaDescription: string;

  @Prop({ default: [] })
  tags: string[];

  /** Set the first time a post goes live (see JobsService). Not defaulted so drafts have none. */
  @Prop()
  publishedAt?: Date;

  @Prop()
  sourceUrl: string;

  @Prop({ type: [{ name: String, url: String }], default: [] })
  attachments: { name: string; url: string }[];
}
  