import { z } from "zod";
export const text = z.string().trim().min(1).max(500);
const requiredNumber = z
  .union([z.number(), z.string().trim().min(1)])
  .pipe(z.coerce.number());
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    "Invalid calendar date",
  );
export const transactionSchema = z.object({
  id: text.max(100),
  date,
  type: z.enum(["Income", "Expense"]),
  category: text,
  batch_display: text,
  student_name: text,
  actual_amount: requiredNumber.refine((n) => n >= 0, "Must be nonnegative"),
  discounts: z.coerce.number().nonnegative().default(0),
  balance: z.coerce.number().nonnegative().default(0),
  over_paid: z.coerce.number().nonnegative().default(0),
  amount: requiredNumber,
  payment_mode: text,
  recorded_by: text,
  description: z.string().max(10000).default(""),
  drive_receipt: z.string().max(2000).default(""),
  fee_months: z
    .array(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(1900).max(9999),
      }),
    )
    .min(1)
    .max(6),
});
export const reviewSchema = z.object({
  student_id: z.coerce.number().int().positive(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  attendance: z.coerce.number().min(0).max(100),
  ratings: z
    .array(z.number().min(1).max(5).nullable())
    .length(10)
    .refine((a) => a.some((v) => v !== null), "Rate at least one skill"),
  strengths: z.string().max(10000).default(""),
  needs_improvement: z.string().max(10000).default(""),
  remarks: z.string().max(10000).default(""),
});
export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
