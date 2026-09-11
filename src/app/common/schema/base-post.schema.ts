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

  @Prop({ default: Date.now })
  publishedAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;

  @Prop()
  sourceUrl: string;

  @Prop({ type: [{ name: String, url: String }], default: [] })
  attachments: { name: string; url: string }[];
}
  