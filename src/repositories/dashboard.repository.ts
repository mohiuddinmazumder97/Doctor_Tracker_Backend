import type { PipelineStage, Types } from 'mongoose';
import { DoctorModel } from '../models/doctor.model.js';
import { PatientModel } from '../models/patient.model.js';
import { createdAtFilter, type DateRange } from '../utils/query.js';

/** `$match` on createdAt when a range is given (served by the createdAt indexes). */
function rangeMatch(range: DateRange): PipelineStage[] {
  const createdAt = createdAtFilter(range);
  return createdAt ? [{ $match: { createdAt } }] : [];
}

export function countDoctors(range: DateRange = {}) {
  const createdAt = createdAtFilter(range);
  return DoctorModel.countDocuments(createdAt ? { createdAt } : {});
}

export function countPatients(range: DateRange = {}) {
  const createdAt = createdAtFilter(range);
  return PatientModel.countDocuments(createdAt ? { createdAt } : {});
}

export function findRecentDoctors(limit: number) {
  return DoctorModel.find({}, { name: 1, specialization: 1, hospital: 1, createdAt: 1 })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean();
}

export function findRecentPatients(limit: number) {
  return PatientModel.find({}, { fullName: 1, condition: 1, gender: 1, doctor: 1, createdAt: 1 })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .populate('doctor', 'name specialization')
    .lean();
}

/** Patient registrations grouped into calendar buckets in the given time zone. */
export function aggregatePatientTrends(range: DateRange, unit: 'day' | 'week' | 'month', timezone: string) {
  return PatientModel.aggregate<{ _id: string; count: number }>([
    ...rangeMatch(range),
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            timezone,
            date: { $dateTrunc: { date: '$createdAt', unit, timezone, startOfWeek: 'monday' } },
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
}

export interface DoctorDistributionRow {
  doctorId: Types.ObjectId;
  name: string;
  specialization: string;
  patientCount: number;
}

/**
 * Top-N doctors by patient count. Grouping happens on the patients collection
 * (index on doctor), and only the N winning doctors are looked up — not all doctors.
 */
export async function aggregateDoctorDistribution(range: DateRange, limit: number) {
  const [result] = await PatientModel.aggregate<{
    top: DoctorDistributionRow[];
    totals: Array<{ patients: number; doctors: number }>;
  }>([
    ...rangeMatch(range),
    { $group: { _id: '$doctor', patientCount: { $sum: 1 } } },
    {
      $facet: {
        top: [
          { $sort: { patientCount: -1, _id: 1 } },
          { $limit: limit },
          {
            $lookup: {
              from: DoctorModel.collection.name,
              localField: '_id',
              foreignField: '_id',
              pipeline: [{ $project: { name: 1, specialization: 1 } }],
              as: 'doctor',
            },
          },
          { $unwind: '$doctor' },
          {
            $project: {
              _id: 0,
              doctorId: '$_id',
              name: '$doctor.name',
              specialization: '$doctor.specialization',
              patientCount: 1,
            },
          },
        ],
        totals: [{ $group: { _id: null, patients: { $sum: '$patientCount' }, doctors: { $sum: 1 } } }],
      },
    },
  ]);
  const totals = result?.totals[0] ?? { patients: 0, doctors: 0 };
  return { items: result?.top ?? [], totalPatients: totals.patients, doctorsWithPatients: totals.doctors };
}

export function aggregateConditionDistribution(range: DateRange) {
  return PatientModel.aggregate<{ condition: string; count: number }>([
    ...rangeMatch(range),
    { $group: { _id: '$condition', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $project: { _id: 0, condition: '$_id', count: 1 } },
  ]);
}

/** Doctors per specialization (range on doctor createdAt), plus their total patients. */
export function aggregateSpecializationDistribution(range: DateRange) {
  return DoctorModel.aggregate<{ specialization: string; doctorCount: number; patientCount: number }>([
    ...rangeMatch(range),
    {
      $lookup: {
        from: PatientModel.collection.name,
        localField: '_id',
        foreignField: 'doctor',
        pipeline: [{ $count: 'count' }],
        as: 'patients',
      },
    },
    {
      $group: {
        _id: '$specialization',
        doctorCount: { $sum: 1 },
        patientCount: { $sum: { $ifNull: [{ $first: '$patients.count' }, 0] } },
      },
    },
    { $sort: { doctorCount: -1, _id: 1 } },
    { $project: { _id: 0, specialization: '$_id', doctorCount: 1, patientCount: 1 } },
  ]);
}
