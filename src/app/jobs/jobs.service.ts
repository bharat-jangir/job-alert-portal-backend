import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job, JobDocument, ExperienceLevel, QualificationLevel } from './schemas/job.schema';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { QueryJobDto } from './dto/query-job.dto';

// Service for handling business logic related to jobs
@Injectable()
export class JobsService {
  // Inject the Job Mongoose model
  constructor(
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
  ) {}

  // Create a new job post
  async create(createJobDto: CreateJobDto): Promise<Job> {
    const createdJob = new this.jobModel(createJobDto);
    return createdJob.save();
  }

  // Find all jobs with optional filters, pagination, and search
  async findAll(query: QueryJobDto): Promise<{ jobs: Job[]; total: number }> {
    const { 
      page = 1, 
      limit = 10, 
      organization, 
      location, 
      experience,
      qualification,
      isActive,
      search
    } = query;

    const filter: any = {};

    // Apply filters based on query params
    if (organization) filter.organization = organization;
    if (location) filter.location = location;
    if (experience) filter.experience = experience;
    if (qualification) filter.qualification = qualification;
    if (isActive !== undefined) filter.isActive = isActive;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { organization: { $regex: search, $options: 'i' } }
      ];
    }

    // Fetch jobs and total count in parallel
    const [jobs, total] = await Promise.all([
      this.jobModel
        .find(filter)
        .sort({ publishedAt: -1 })
        .skip((page - 1) * limit)
        .select("-htmlContent -tags -eligibility")
        .populate('organizationId')
        .limit(limit)
        .exec(),
      this.jobModel.countDocuments(filter)
    ]);

    return { jobs, total };
  }

  // Find a single job by its ID
  async findOne(id: string): Promise<Job> {
    const job = await this.jobModel.findById(id).populate('organizationId').exec();
    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
    return job;
  }

  // Update a job by its ID
  async update(id: string, updateJobDto: UpdateJobDto): Promise<Job> {
    console.log("post id :",id)
    const updatedJob = await this.jobModel
      .findByIdAndUpdate(id, updateJobDto, { new: true })
      .exec();
    if (!updatedJob) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
    return updatedJob;
  }

  // Toggle the isBulletin flag for a job
  async toggleBulletin(id: string): Promise<Job> {
    const job = await this.jobModel.findById(id).exec();
    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
    return this.jobModel.findByIdAndUpdate(id, { isBulletin: !job.isBulletin }, { new: true }).exec() as Promise<Job>;
  }

  // Remove a job by its ID
  async remove(id: string): Promise<void> {
    const result = await this.jobModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
  }

  // Increment the view count for a job
  async incrementViews(id: string): Promise<Job> {
    const job = await this.jobModel
      .findByIdAndUpdate(
        id,
        { $inc: { views: 1 } },
        { new: true }
      )
      .exec();
    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
    return job;
  }

  // Increment the applications count for a job
  async incrementApplications(id: string): Promise<Job> {
    const job = await this.jobModel
      .findByIdAndUpdate(
        id,
        { $inc: { applications: 1 } },
        { new: true }
      )
      .exec();
    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
    return job;
  }

  // Find jobs with upcoming deadlines
  async findUpcomingDeadlines(): Promise<Job[]> {
    const now = new Date();
    return this.jobModel
      .find({
        lastDate: { $gt: now },
        isActive: true
      })
      .sort({ lastDate: 1 })
      .limit(10)
      .exec();
  }

  // Find jobs marked as bulletins
  async findBulletins(): Promise<Job[]> {
    return this.jobModel
      .find({ isBulletin: true })
      .populate('organizationId')
      .sort({ updatedAt: -1 })
      .exec();
  }

  // Find popular jobs by views and applications
  async findPopularJobs(): Promise<Job[]> {
    return this.jobModel
      .find({ isActive: true })
      .sort({ views: -1, applications: -1 })
      .populate('organizationId', 'name slug')
      .limit(10)
      .exec();
  }

  // Find jobs by organization
  async findJobsByOrganization(organization: string): Promise<Job[]> {
    return this.jobModel
      .find({ organization, isActive: true })
      .sort({ publishedAt: -1 })
      .exec();
  }

  // Find a job by its slug
  async findBySlug(slug: string): Promise<Job> {
    if (!slug) {
      throw new NotFoundException('Slug is required');
    }
    
    const job = await this.jobModel.findOne({ slug, isActive: true }).populate('organizationId').exec();
    if (!job) {
      throw new NotFoundException(`Job with slug ${slug} not found`);
    }
    return job;
  }

  // Search jobs by a query string (searches title, description, organization, location)
  async searchJobs(query: string): Promise<Job[]> {
    return this.jobModel
      .find({
        isActive: true,
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { organization: { $regex: query, $options: 'i' } },
          { location: { $regex: query, $options: 'i' } }
        ]
      })
      .sort({ publishedAt: -1 })
      .select("_id title slug")
      .lean()
      .exec()
  }

  // Get the latest jobs, limited by the provided number (default 15)
  async findLatestJobs(limit: number = 15): Promise<Job[]> {
    return this.jobModel
      .find({ isActive: true })
      .sort({ publishedAt: -1 })
      .select("_id title slug organization organizationId lastDate")
      .populate('organizationId', 'name slug')
      .limit(limit)
      .exec();
  }

  // Find jobs by type
  async findByType(type: string): Promise<any[]> {
    return this.jobModel
      .find({ type, isActive: true })
      .select('title slug location lastDate organization')
      .populate('organizationId', 'name slug')
      .sort({ publishedAt: -1, createdAt: -1 })
      .exec();
  }

  // New method: get distinct organizations for homepage
  async getDistinctOrganizations(): Promise<string[]> {
    return this.jobModel.distinct('organization').exec() as Promise<string[]>;
  }
}