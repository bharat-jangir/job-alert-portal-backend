import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { ContactQuery, ContactQuerySchema } from './schemas/contact-query.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: ContactQuery.name, schema: ContactQuerySchema }])],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
