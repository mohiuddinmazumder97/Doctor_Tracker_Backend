/**
 * Development seed script.
 *
 *   npm run seed            → upsert demo admin; add demo doctors/patients only if the DB has none
 *   npm run seed -- --reset → upsert demo admin; wipe and regenerate demo doctors/patients
 *   npm run seed -- --admin-only
 *
 * Demo data is generated with a seeded PRNG so every run produces the same dataset,
 * with createdAt dates spread over the past 12 months (so trend charts are meaningful).
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { MEDICAL_CONDITIONS, SPECIALIZATIONS, type Gender } from '../src/constants/domain.js';
import { AdminModel } from '../src/models/admin.model.js';
import { DoctorModel } from '../src/models/doctor.model.js';
import { PatientModel } from '../src/models/patient.model.js';
import { hashPassword } from '../src/services/auth.service.js';

const DOCTOR_COUNT = 24;
const PATIENT_COUNT = 180;

const args = new Set(process.argv.slice(2));
const reset = args.has('--reset');
const adminOnly = args.has('--admin-only');

// --- deterministic random helpers -------------------------------------------------
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(20261119);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
const int = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;
const phone = () => `+1 (${int(200, 989)}) ${int(200, 999)}-${String(int(0, 9999)).padStart(4, '0')}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');

/**
 * Random date in the last `days` days. `skew` > 1 biases towards recent dates
 * (a gently growing practice); 1 is uniform.
 */
function recentDate(days: number, skew = 1): Date {
  const daysAgo = Math.pow(random(), skew) * days;
  return new Date(Date.now() - daysAgo * 86_400_000 - int(0, 3_600) * 1000);
}

const FIRST_NAMES = ['Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Elijah', 'Sophia', 'James', 'Isabella', 'Lucas', 'Mia', 'Mateo', 'Amelia', 'Ethan', 'Harper', 'Aiden', 'Aisha', 'Omar', 'Priya', 'Arjun', 'Mei', 'Hiro', 'Fatima', 'Carlos', 'Sofia', 'Daniel', 'Grace', 'Samuel', 'Chloe', 'Yusuf', 'Leah', 'Nathan', 'Zara', 'Ryan', 'Nora', 'Ibrahim'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Lee', 'Patel', 'Khan', 'Chen', 'Nguyen', 'Kim', 'Rahman', 'Ahmed', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'Wright'];
const HOSPITALS = ['St. Mary Medical Center', 'Riverside General Hospital', 'Northwell Health Clinic', 'Mercy Heart Institute', 'Lakeside Children’s Hospital', 'City Care Hospital', 'Green Valley Medical', 'Summit Health Partners'];
const CITIES: Array<[city: string, state: string]> = [['Boston', 'MA'], ['Austin', 'TX'], ['Seattle', 'WA'], ['Denver', 'CO'], ['Chicago', 'IL'], ['Portland', 'OR'], ['Atlanta', 'GA'], ['San Diego', 'CA']];
const STREETS = ['Maple Ave', 'Oak Street', 'Cedar Lane', 'Pine Road', 'Elm Drive', 'Birch Way', 'Willow Court', 'Lake View Blvd'];

// Specializations weighted towards common practice areas, so charts are not flat.
const WEIGHTED_SPECIALIZATIONS = SPECIALIZATIONS.filter((s) => s !== 'Other').flatMap((s) =>
  ['Cardiology', 'General Practice', 'Pediatrics', 'Orthopedics'].includes(s) ? [s, s, s] : [s],
);
const WEIGHTED_CONDITIONS = MEDICAL_CONDITIONS.flatMap((c) =>
  ['Hypertension', 'Diabetes', 'Asthma', 'Anxiety'].includes(c) ? [c, c, c, c] : c === 'Other' ? [c] : [c, c],
);

// --- seed steps ------------------------------------------------------------------
async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@doctortracker.dev').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  await AdminModel.updateOne(
    { email },
    { $set: { name: 'Demo Administrator', email, role: 'admin', passwordHash: await hashPassword(password) } },
    { upsert: true },
  );
  console.log(`✔ Admin ready: ${email}`);
}

async function seedDemoData() {
  if (reset) {
    await PatientModel.deleteMany({});
    await DoctorModel.deleteMany({});
    console.log('✔ Cleared existing doctors and patients');
  } else if ((await DoctorModel.estimatedDocumentCount()) > 0) {
    console.log('• Doctors already exist — skipping demo data (use --reset to regenerate)');
    return;
  }

  const usedNames = new Set<string>();
  const doctorDocs = Array.from({ length: DOCTOR_COUNT }, (_, i) => {
    let name: string;
    do name = `Dr. ${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    while (usedNames.has(name));
    usedNames.add(name);
    // Doctors joined over the past year; a few this month.
    const createdAt = i < 3 ? recentDate(18) : recentDate(365, 0.8);
    return {
      name,
      specialization: pick(WEIGHTED_SPECIALIZATIONS),
      hospital: pick(HOSPITALS),
      phone: phone(),
      email: `${slug(name.replace('Dr. ', ''))}@${slug(pick(['carehealth', 'medplus', 'healthfirst']))}.org`,
      createdAt,
      updatedAt: createdAt,
    };
  });
  // insertMany with explicit timestamps: disable auto-timestamps so backdated dates are kept.
  const doctors = await DoctorModel.insertMany(doctorDocs, { timestamps: false });
  console.log(`✔ Inserted ${doctors.length} doctors`);

  // Some doctors are much busier than others → interesting "patients per doctor" chart.
  const doctorWeights = doctors.flatMap((d, i) => Array.from({ length: (i % 5) + 1 }, () => d));

  const patientDocs = Array.from({ length: PATIENT_COUNT }, (_, i) => {
    const doctor = pick(doctorWeights);
    const fullName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    // A patient can't register before their doctor joined.
    const doctorAgeDays = Math.max(1, (Date.now() - doctor.createdAt.getTime()) / 86_400_000);
    const createdAt = recentDate(Math.min(365, doctorAgeDays), 1.2);
    const [city, state] = pick(CITIES);
    const condition = pick(WEIGHTED_CONDITIONS);
    const gender: Gender = condition === 'Pregnancy' ? 'female' : i % 25 === 0 ? 'other' : pick(['male', 'female'] as const);
    return {
      fullName,
      email: `${slug(fullName)}${i}@example.com`,
      phone: phone(),
      dateOfBirth: new Date(int(1945, 2018), int(0, 11), int(1, 28)),
      gender,
      condition,
      doctor: doctor._id,
      address: { street: `${int(10, 9999)} ${pick(STREETS)}`, city, state, postalCode: String(int(10000, 99999)), country: 'United States' },
      createdAt,
      updatedAt: createdAt,
    };
  });
  const patients = await PatientModel.insertMany(patientDocs, { timestamps: false });
  console.log(`✔ Inserted ${patients.length} patients`);
}

async function main() {
  await connectDatabase();
  // Make sure indexes (incl. unique constraints) exist before inserting.
  await Promise.all([AdminModel.syncIndexes(), DoctorModel.syncIndexes(), PatientModel.syncIndexes()]);
  await seedAdmin();
  if (!adminOnly) await seedDemoData();
}

main()
  .then(() => console.log('Seeding complete.'))
  .catch((err: unknown) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
