import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Faq, FaqDocument } from './schemas/faq.schema';
import { CreateFaqDto } from './dto/create-faq.dto';

@Injectable()
export class FaqsService {
  constructor(@InjectModel(Faq.name) private faqModel: Model<FaqDocument>) {}

  /** Create a new FAQ; auto-assigns next order value */
  async create(dto: CreateFaqDto): Promise<Faq> {
    if (dto.order === undefined) {
      const last = await this.faqModel.findOne().sort({ order: -1 }).exec();
      dto.order = last ? last.order + 1 : 0;
    }
    return new this.faqModel(dto).save();
  }

  /** Get all FAQs sorted by order (admin — includes inactive) */
  async findAll(): Promise<Faq[]> {
    return this.faqModel.find().sort({ order: 1 }).exec();
  }

  /** Get only active FAQs sorted by order (public) */
  async findPublic(): Promise<Faq[]> {
    return this.faqModel.find({ isActive: true }).sort({ order: 1 }).exec();
  }

  async findOne(id: string): Promise<Faq> {
    const faq = await this.faqModel.findById(id).exec();
    if (!faq) throw new NotFoundException(`FAQ ${id} not found`);
    return faq;
  }

  async update(id: string, dto: Partial<CreateFaqDto>): Promise<Faq> {
    const faq = await this.faqModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!faq) throw new NotFoundException(`FAQ ${id} not found`);
    return faq;
  }

  async remove(id: string): Promise<void> {
    const res = await this.faqModel.deleteOne({ _id: id }).exec();
    if (res.deletedCount === 0) throw new NotFoundException(`FAQ ${id} not found`);
  }

  /**
   * Reorder: accepts array of { id, order } pairs.
   * Admin sends the full ordered list; we update each doc's order field.
   */
  async reorder(items: { id: string; order: number }[]): Promise<{ updated: number }> {
    const ops = items.map(({ id, order }) =>
      this.faqModel.updateOne({ _id: id }, { $set: { order } }).exec()
    );
    await Promise.all(ops);
    return { updated: ops.length };
  }

  /** Move a single FAQ up (decrement order) by swapping with previous */
  async moveUp(id: string): Promise<Faq[]> {
    const faq = await this.faqModel.findById(id).exec();
    if (!faq) throw new NotFoundException(`FAQ ${id} not found`);
    const prev = await this.faqModel
      .findOne({ order: { $lt: faq.order } })
      .sort({ order: -1 })
      .exec();
    if (prev) {
      const tmp = faq.order;
      faq.order = prev.order;
      prev.order = tmp;
      await faq.save();
      await prev.save();
    }
    return this.findAll();
  }

  /** Move a single FAQ down (increment order) by swapping with next */
  async moveDown(id: string): Promise<Faq[]> {
    const faq = await this.faqModel.findById(id).exec();
    if (!faq) throw new NotFoundException(`FAQ ${id} not found`);
    const next = await this.faqModel
      .findOne({ order: { $gt: faq.order } })
      .sort({ order: 1 })
      .exec();
    if (next) {
      const tmp = faq.order;
      faq.order = next.order;
      next.order = tmp;
      await faq.save();
      await next.save();
    }
    return this.findAll();
  }
}
