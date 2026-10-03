/**
 * Seed script to create the initial super-admin user.
 *
 * Run with: npx ts-node -r tsconfig-paths/register scripts/seedAdmin.ts
 *
 * This script:
 * 1. Connects to MongoDB using MONGODB_URI from .env
 * 2. Checks if a super-admin already exists
 * 3. If not, creates one with the credentials below
 *
 * CHANGE THE PASSWORD AFTER FIRST LOGIN!
 */
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.development' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

// Define a minimal user schema for seeding
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'viewer' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function seedAdmin() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI!);
  console.log('✅ Connected to MongoDB');

  const password = await bcrypt.hash('Admin@123', 10);

  const testUsers = [
    { name: 'Super Admin', email: 'admin@rojgarresult.com', role: 'super-admin' },
    { name: 'Publisher User', email: 'publisher@rojgarresult.com', role: 'publisher' },
    { name: 'Editor User', email: 'editor@rojgarresult.com', role: 'editor' },
    { name: 'Viewer User', email: 'viewer@rojgarresult.com', role: 'viewer' },
  ];

  for (const u of testUsers) {
    const existing = await User.findOne({ email: u.email });
    if (!existing) {
      await User.create({
        name: u.name,
        email: u.email,
        password,
        role: u.role,
        isActive: true,
      });
      console.log(`✅ Seeded ${u.role}: ${u.email}`);
    } else {
      console.log(`ℹ️  Already exists (${u.role}): ${u.email}`);
    }
  }

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB');
}

seedAdmin().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
