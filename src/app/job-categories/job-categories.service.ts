import { Injectable, NotFoundException, ConflictException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JobCategory, JobCategoryDocument } from './schemas/job-category.schema';
import { CreateJobCategoryDto, UpdateJobCategoryDto } from './dto/job-category.dto';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { CacheService } from '../../common/services/cache.service';
import { RevalidateService } from '../../common/services/revalidate.service';

@Injectable()
export class JobCategoriesService implements OnModuleInit {
  constructor(
    @InjectModel(JobCategory.name) private jobCategoryModel: Model<JobCategoryDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    private cache: CacheService,
    private revalidate: RevalidateService,
  ) {}

  private changed() {
    this.cache.invalidate('jobs:');
    this.revalidate.trigger({ tags: ['categories', 'home', 'sitemap'] });
  }

  /** Hindi labels for the built-in categories (the words people actually search for). */
  private static readonly HINDI_NAMES: Record<string, string> = {
    job: 'नौकरी', result: 'रिजल्ट', 'answer-key': 'आंसर की', admission: 'प्रवेश', 'admit-card': 'एडमिट कार्ड',
    'online-form': 'ऑनलाइन फॉर्म', update: 'अपडेट', syllabus: 'सिलेबस', upcoming: 'आगामी', verification: 'सत्यापन',
    'sarkari-yojana': 'सरकारी योजना',
  };

  async onModuleInit() {
    const count = await this.jobCategoryModel.countDocuments();
    if (count === 0) {
      console.log('Seeding initial job categories...');
      const initialCategories = [
        { name: 'Job', displayName: 'Job', slug: 'job', sequenceNo: 1 },
        { name: 'Result', displayName: 'Result', slug: 'result', sequenceNo: 2 },
        { name: 'Answer Key', displayName: 'Answer Key', slug: 'answer-key', sequenceNo: 3 },
        { name: 'Admission', displayName: 'Admission', slug: 'admission', sequenceNo: 4 },
        { name: 'Admit Card', displayName: 'Admit Card', slug: 'admit-card', sequenceNo: 5 },
        { name: 'Online Form', displayName: 'Online Form', slug: 'online-form', sequenceNo: 6 },
        { name: 'Update', displayName: 'Update', slug: 'update', sequenceNo: 7 },
        { name: 'Syllabus', displayName: 'Syllabus', slug: 'syllabus', sequenceNo: 8 },
        { name: 'Upcoming', displayName: 'Upcoming', slug: 'upcoming', sequenceNo: 9 },
        { name: 'Verification', displayName: 'Verification', slug: 'verification', sequenceNo: 10 },
        { name: 'Sarkari Yojana', displayName: 'Sarkari Yojana', slug: 'sarkari-yojana', sequenceNo: 11 },
      ];
      await this.jobCategoryModel.insertMany(initialCategories);
      console.log('Successfully seeded job categories.');
    }
    // idempotent: fills a Hindi label only where none is set, so edits made in the admin are never overwritten
    for (const [slug, hi] of Object.entries(JobCategoriesService.HINDI_NAMES)) {
      await this.jobCategoryModel.updateOne(
        { slug, $or: [{ displayNameHi: { $exists: false } }, { displayNameHi: '' }] },
        { $set: { displayNameHi: hi } },
      );
    }
  }

  async create(createJobCategoryDto: CreateJobCategoryDto): Promise<JobCategory> {
    const existing = await this.jobCategoryModel.findOne({ slug: createJobCategoryDto.slug }).exec();
    if (existing) {
      throw new ConflictException('JobCategory with this slug already exists');
    }
    
    // Default displayName to name if not provided
    if (!createJobCategoryDto.displayName) {
      createJobCategoryDto.displayName = createJobCategoryDto.name;
    }

    const created = await new this.jobCategoryModel(createJobCategoryDto).save();
    this.changed();
    return created;
  }

  /** With `lang=hi` each category's displayName is its Hindi label (when it has one). */
  async findAllActive(lang?: string): Promise<JobCategory[]> {
    const rows = await this.jobCategoryModel.find({ isDeleted: false }).sort({ sequenceNo: 1 }).exec();
    if (lang !== 'hi') return rows;
    return rows.map((r) => {
      const o: any = r.toObject();
      return { ...o, displayName: o.displayNameHi || o.displayName || o.name };
    });
  }

  async findAll(): Promise<JobCategory[]> {
    return this.jobCategoryModel.find().sort({ sequenceNo: 1 }).exec();
  }

  async findOne(id: string): Promise<JobCategory> {
    const category = await this.jobCategoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException(`JobCategory with ID "${id}" not found`);
    }
    return category;
  }

  async update(id: string, updateJobCategoryDto: UpdateJobCategoryDto): Promise<JobCategory> {
    if (updateJobCategoryDto.slug) {
      // posts store the category slug as `type`, so renaming it would orphan them
      const current = await this.jobCategoryModel.findById(id).lean();
      if (current && current.slug !== updateJobCategoryDto.slug && (await this.jobModel.exists({ type: current.slug }))) {
        throw new ConflictException('Cannot change the slug of a category that already has posts');
      }
    }
    const category = await this.jobCategoryModel.findByIdAndUpdate(id, updateJobCategoryDto, { new: true }).exec();
    if (!category) {
      throw new NotFoundException(`JobCategory with ID "${id}" not found`);
    }
    this.changed();
    return category;
  }

  async softDelete(id: string): Promise<JobCategory> {
    const existing = await this.jobCategoryModel.findById(id).lean();
    if (existing && (await this.jobModel.exists({ type: existing.slug }))) {
      throw new ConflictException('This category has posts. Move or delete them first.');
    }
    const category = await this.jobCategoryModel.findByIdAndUpdate(id, { isDeleted: true }, { new: true }).exec();
    if (!category) {
      throw new NotFoundException(`JobCategory with ID "${id}" not found`);
    }
    this.changed();
    return category;
  }

  async reorder(id: string, newSequence: number): Promise<JobCategory[]> {
    const category = await this.jobCategoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException(`JobCategory with ID "${id}" not found`);
    }

    // 1. Fetch all active categories sorted by current sequenceNo and updatedAt
    const categories = await this.jobCategoryModel
      .find({ isDeleted: false })
      .sort({ sequenceNo: 1, updatedAt: -1 })
      .exec();

    // 2. Remove target item from list and place it at the exact target index
    const currentIndex = categories.findIndex(c => (c as any)._id.toString() === id);
    if (currentIndex !== -1) {
      const [movedCategory] = categories.splice(currentIndex, 1);
      
      // Clamp newSequence bounds between 1 and total count
      const targetIndex = Math.max(0, Math.min(newSequence - 1, categories.length));
      categories.splice(targetIndex, 0, movedCategory);
    }

    // 3. Prepare bulkWrite ops to normalize sequences sequentially (1, 2, 3, 4, 5...)
    const bulkOps = categories.map((item, index) => ({
      updateOne: {
        filter: { _id: item._id },
        update: { $set: { sequenceNo: index + 1 } },
      },
    }));

    // 4. Execute all sequence updates efficiently in a single operation
    if (bulkOps.length > 0) {
      await this.jobCategoryModel.bulkWrite(bulkOps);
    }

    this.changed();
    return this.findAllActive();
  }
}
