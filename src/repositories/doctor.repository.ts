import type { PipelineStage, QueryFilter, Types } from 'mongoose';
import { DoctorModel, type Doctor } from '../models/doctor.model.js';
import { PatientModel } from '../models/patient.model.js';
import { compact, createdAtFilter } from '../utils/query.js';
import { containsRegex } from '../utils/regex.js';
import type { CreateDoctorInput, ListDoctorsQuery, UpdateDoctorInput } from '../validators/doctor.validator.js';

export type DoctorRecord = Doctor & { _id: Types.ObjectId };
export type DoctorWithCount = DoctorRecord & { patientCount: number };

const DOCTOR_PROJECTION = {
  name: 1,
  specialization: 1,
  hospital: 1,
  phone: 1,
  email: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

/** Stage that adds `patientCount`; the sub-pipeline is served by the { doctor, createdAt } index. */
const patientCountStages: PipelineStage[] = [
  {
    $lookup: {
      from: PatientModel.collection.name,
      localField: '_id',
      foreignField: 'doctor',
      pipeline: [{ $count: 'count' }],
      as: 'patientStats',
    },
  },
  {
    $set: { patientCount: { $ifNull: [{ $first: '$patientStats.count' }, 0] } },
  },
  { $unset: 'patientStats' },
];

function buildListFilter(query: ListDoctorsQuery): QueryFilter<Doctor> {
  const search = query.search ? containsRegex(query.search) : undefined;
  return compact({
    specialization: query.specialization,
    createdAt: createdAtFilter(query),
    $or: search
      ? [{ name: search }, { email: search }, { hospital: search }, { specialization: search }]
      : undefined,
  }) as QueryFilter<Doctor>;
}

export async function findDoctors(query: ListDoctorsQuery) {
  const filter = buildListFilter(query);
  const direction = query.order === 'asc' ? 1 : -1;
  // _id as a tiebreaker keeps skip/limit pagination stable when sort values are equal.
  const sort: Record<string, 1 | -1> = { [query.sortBy]: direction, _id: direction };
  const skip = (query.page - 1) * query.limit;

  // Sorting by patientCount needs the count before $sort; otherwise count only the current page.
  const pipeline: PipelineStage[] =
    query.sortBy === 'patientCount'
      ? [
          { $match: filter },
          { $project: DOCTOR_PROJECTION },
          ...patientCountStages,
          { $sort: sort },
          { $skip: skip },
          { $limit: query.limit },
        ]
      : [
          { $match: filter },
          { $sort: sort },
          { $skip: skip },
          { $limit: query.limit },
          { $project: DOCTOR_PROJECTION },
          ...patientCountStages,
        ];

  const [items, total] = await Promise.all([
    DoctorModel.aggregate<DoctorWithCount>(pipeline),
    DoctorModel.countDocuments(filter),
  ]);
  return { items, total };
}

export async function findDoctorById(id: string): Promise<DoctorWithCount | null> {
  const [doctor] = await DoctorModel.aggregate<DoctorWithCount>([
    { $match: { _id: new DoctorModel.base.Types.ObjectId(id) } },
    { $project: DOCTOR_PROJECTION },
    ...patientCountStages,
  ]);
  return doctor ?? null;
}

export function doctorExists(id: string) {
  return DoctorModel.exists({ _id: id });
}

export async function createDoctor(input: CreateDoctorInput): Promise<DoctorRecord> {
  const doctor = await DoctorModel.create(input);
  return doctor.toObject();
}

export function updateDoctor(id: string, input: UpdateDoctorInput) {
  return DoctorModel.findByIdAndUpdate(id, input, {
    returnDocument: 'after',
    runValidators: true,
    projection: DOCTOR_PROJECTION,
  }).lean<DoctorRecord>();
}

export function deleteDoctor(id: string) {
  return DoctorModel.findByIdAndDelete(id, { projection: { _id: 1 } }).lean();
}
