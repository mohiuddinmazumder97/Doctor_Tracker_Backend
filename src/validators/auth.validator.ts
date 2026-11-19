import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .toLowerCase()
    .pipe(z.email('Enter a valid email address').max(254))
    .meta({ format: 'email', example: 'admin@doctortracker.dev' }),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
